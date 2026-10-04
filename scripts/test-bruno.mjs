import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const resetToken = randomBytes(32).toString('base64url');
const server = spawn(
  process.execPath,
  ['--import', 'tsx', 'apps/mock-api/src/server.ts'],
  {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', MOCK_API_PORT: '0', MOCK_RESET_TOKEN: resetToken },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let output = '';
let serverPort;
let serverError;
server.on('error', (error) => {
  serverError = error;
});
server.stderr.resume();
server.stdout.setEncoding('utf8');
server.stdout.on('data', (chunk) => {
  output += chunk;
  const ready = output.match(/MOCK_API_READY:(\d+)/);
  if (ready) serverPort = Number(ready[1]);
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error('El proceso mock terminó antes de iniciar.');
    if (serverPort) {
      const response = await fetch(`http://${host}:${serverPort}/health/live`).catch(() => null);
      if (response?.ok) return;
    }
    await delay(100);
  }
  throw new Error('El proceso mock no quedó listo dentro del tiempo permitido.');
}

async function resetMock(baseUrl) {
  const response = await fetch(`${baseUrl}/__mock/reset`, {
    method: 'POST',
    headers: {
      Origin: 'http://127.0.0.1:5173',
      'X-Mock-Reset-Token': resetToken,
    },
  });
  if (response.status !== 204) throw new Error('No se pudo reiniciar el estado sintético del mock.');
}

function runScenario(folder, baseUrl) {
  const scenarioIdempotencyKey = `${path.basename(folder)}-${randomBytes(12).toString('hex')}`;
  const result = spawnSync('bru', [
    'run', folder, '-r',
    '--env-file', 'environments/local.bru',
    '--env-var', `baseUrl=${baseUrl}`,
    '--env-var', `idempotencyKey=${scenarioIdempotencyKey}`,
    '--tests-only',
    '--reporter-skip-all-headers',
    '--reporter-skip-body',
  ], { cwd: path.join(root, 'bruno'), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló el escenario Bruno: ${folder}`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(2_000),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

try {
  await waitForServer();
  const baseUrl = `http://${host}:${serverPort}`;
  await resetMock(baseUrl);
  runScenario('scenarios/health', baseUrl);
  await resetMock(baseUrl);
  runScenario('scenarios/donor', baseUrl);
  runScenario('scenarios/hospital', baseUrl);
  await resetMock(baseUrl);
  runScenario('scenarios/superadmin', baseUrl);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Falló el runner Bruno.'}\n`);
  process.exitCode = 1;
} finally {
  await stopServer();
}
