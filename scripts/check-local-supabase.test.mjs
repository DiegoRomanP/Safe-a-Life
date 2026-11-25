// node:test de la guarda de `dev:local`: solo arranca contra el Supabase local. Valores sintéticos.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isLocalSupabase } from './check-local-supabase.mjs';

const script = fileURLToPath(new URL('./check-local-supabase.mjs', import.meta.url));
const REMOTE = 'https://proyectosintetico.supabase.co';
const file = (url) => `OTRA=1\nSUPABASE_URL=${url}\n`;

test('acepta solo direcciones del propio equipo', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321']) {
    assert.equal(isLocalSupabase({}, file(url)), true, url);
  }
});

test('rechaza remotos, parecidos a local, vacíos y ausentes', () => {
  for (const url of [REMOTE, 'http://127.0.0.1.example.test', 'http://localhost@example.test', 'http://192.168.1.20:54321', 'sin-url', '']) {
    assert.equal(isLocalSupabase({}, file(url)), false, url);
  }
  assert.equal(isLocalSupabase({}, ''), false);
});

test('lee el archivo igual que `node --env-file`: espacios, comillas y comentarios', () => {
  assert.equal(isLocalSupabase({}, `# SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_URL = "${REMOTE}"\n`), false);
  assert.equal(isLocalSupabase({}, 'SUPABASE_URL = "http://127.0.0.1:54321" # local\n'), true);
});

test('la variable del proceso gana al archivo, como en el backend', () => {
  assert.equal(isLocalSupabase({ SUPABASE_URL: REMOTE }, file('http://127.0.0.1:54321')), false);
  assert.equal(isLocalSupabase({ SUPABASE_URL: 'http://127.0.0.1:54321' }, file(REMOTE)), true);
  assert.equal(isLocalSupabase({ SUPABASE_URL: '' }, file('http://127.0.0.1:54321')), false);
});

test('ejecutado: sale con 1 y explica qué cambiar, sin imprimir el destino', () => {
  const run = (url) => spawnSync(process.execPath, [script], { env: { ...process.env, SUPABASE_URL: url }, encoding: 'utf8', timeout: 5_000 });
  const remote = run(REMOTE);
  assert.equal(remote.status, 1);
  assert.match(remote.stderr, /supabase status --workdir backend/);
  assert.doesNotMatch(remote.stderr + remote.stdout, /proyectosintetico/);
  assert.equal(run('http://127.0.0.1:54321').status, 0);
});

test('`dev:local` ejecuta la guarda antes de arrancar los procesos', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  // `-k -n` separados: pegados, concurrently toma los nombres como un comando y pierde `-k`.
  assert.match(scripts['dev:local'], /^node scripts\/check-local-supabase\.mjs && concurrently -k -n api,worker,front,mail "/);
});
