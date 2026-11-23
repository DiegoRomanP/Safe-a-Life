// Comprueba, sin Supabase ni red, la frontera de transporte seguro del backend compilado y del borde (ADR-004, ADR-008):
// guard de borde (X-Edge-Secret), solo HTTPS, cabeceras defensivas completas, ausencia total de CORS y la configuración
// de frontend/vercel.json (rewrites hacia el backend, inyección del secreto y cabeceras). Arranca `backend/dist/server.js` con un
// entorno de PRODUCCIÓN sintético (secretos generados al vuelo; nunca lee backend/.env). Uso: `npm run check:headers`.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SECURITY_HEADERS } from '../backend/src/shared/http/security-headers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const failures = [];

function check(name, ok, detail = '') {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}\n`);
  if (!ok) failures.push(name);
}

const secret = () => randomBytes(48).toString('base64url');
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, host, () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

// --- Borde: frontend/vercel.json ---------------------------------------------------------------------------------------
const vercel = JSON.parse(readFileSync(path.join(root, 'frontend/vercel.json'), 'utf8'));
const routeFor = (prefix) => (vercel.routes ?? []).find((route) => route.src === `/${prefix}/(.*)`);
for (const prefix of ['api', 'health']) {
  const route = routeFor(prefix);
  const transform = route?.transforms?.find((item) => item.type === 'request.headers' && item.target?.key === 'x-edge-secret');
  check(`vercel.json: /${prefix}/* se reenvía al backend por HTTPS`, typeof route?.dest === 'string' && route.dest.startsWith('https://') && route.dest.endsWith(`/${prefix}/$1`));
  check(`vercel.json: /${prefix}/* inyecta X-Edge-Secret desde EDGE_SHARED_SECRET (sin secreto en el repo)`,
    transform?.op === 'set' && transform.args === '$EDGE_SHARED_SECRET' && transform.env?.includes('EDGE_SHARED_SECRET'));
}
check('vercel.json: el fallback SPA no captura /api ni /health', (vercel.rewrites ?? []).some((item) => item.source.includes('(?!api/|health')));
const edgeHeaders = Object.fromEntries((vercel.headers?.[0]?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]));
for (const [name, expected] of Object.entries({
  'strict-transport-security': (value) => /max-age=\d{8,}/.test(value) && value.includes('includeSubDomains') && !value.includes('preload'),
  'permissions-policy': (value) => value.includes('geolocation=()'),
  'cross-origin-opener-policy': (value) => value === 'same-origin',
  'cross-origin-resource-policy': (value) => value === 'same-origin',
  'referrer-policy': (value) => value === 'no-referrer',
  'x-content-type-options': (value) => value === 'nosniff',
  'x-frame-options': (value) => value === 'DENY',
})) check(`vercel.json: cabecera ${name}`, edgeHeaders[name] !== undefined && expected(edgeHeaders[name]), String(edgeHeaders[name]));
const csp = edgeHeaders['content-security-policy'] ?? '';
check('vercel.json: CSP sin unsafe-inline en scripts ni <style>, con frame-ancestors none y upgrade-insecure-requests',
  /script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && csp.includes("frame-ancestors 'none'") && csp.includes('upgrade-insecure-requests'), csp);
check('vercel.json: la CSP permite las teselas de OpenStreetMap y Mapbox, y nada más amplio',
  csp.includes('img-src \'self\' data: https://tile.openstreetmap.org') && csp.includes("connect-src 'self' https://api.mapbox.com") && !/\*/.test(csp), csp);

// --- Backend compilado --------------------------------------------------------------------------------------------------
const build = spawnSync('npm', ['run', 'build', '--workspace', 'backend'], { cwd: root, stdio: 'ignore' });
check('backend: compila (tsc)', build.status === 0);
if (build.status !== 0) process.exit(1);

const port = await freePort();
const edge = secret();
const env = {
  PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port),
  SUPABASE_URL: 'https://proyecto.supabase.example.test', SUPABASE_JWKS_URL: 'https://proyecto.supabase.example.test/auth/v1/.well-known/jwks.json',
  SUPABASE_ANON_KEY: `sb_publishable_${secret()}`, SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${secret()}`,
  ALLOWED_ORIGINS: 'https://app.example.test', TRUSTED_PROXIES: '1', EDGE_SHARED_SECRET: edge,
  CSRF_SECRET: secret(), EMAIL_HMAC_SECRET: secret(), CURSOR_SECRET: secret(),
  OUTBOX_KEYS: `k1:${randomBytes(32).toString('base64')}`, OUTBOX_KEY_CURRENT: 'k1',
  API_TECHNICAL_EMAIL: 'api.tecnica@example.test', API_TECHNICAL_PASSWORD: secret(),
  WORKER_EMAIL: 'worker@example.test', WORKER_PASSWORD: secret(),
  APP_PUBLIC_URL: 'https://app.example.test', EMAIL_FROM: 'no-responder@example.test',
  EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_sintetica', RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(24).toString('base64')}`,
};
const server = spawn(process.execPath, ['backend/dist/server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
server.stderr.on('data', (chunk) => { stderr += chunk; });
const base = `http://${host}:${port}`;
const hit = (route, init = {}) => fetch(`${base}${route}`, { redirect: 'manual', ...init });

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    if (server.exitCode !== null) break;
    try { up = (await hit('/health/live')).status < 500; } catch { await delay(250); }
  }
  check('backend: arranca en producción con el entorno sintético', up, stderr.trim().slice(0, 200));
  if (!up) throw new Error('El backend no arrancó.');

  const viaEdge = { 'x-edge-secret': edge, 'x-forwarded-proto': 'https' };
  check('borde: sin X-Edge-Secret, 403', (await hit('/api/v1/no-existe')).status === 403);
  check('borde: con un X-Edge-Secret incorrecto, 403', (await hit('/api/v1/no-existe', { headers: { 'x-edge-secret': secret(), 'x-forwarded-proto': 'https' } })).status === 403);
  check('https: con el secreto pero sin X-Forwarded-Proto https, 403', (await hit('/api/v1/no-existe', { headers: { 'x-edge-secret': edge } })).status === 403);
  check('https: con X-Forwarded-Proto http, 403', (await hit('/api/v1/no-existe', { headers: { 'x-edge-secret': edge, 'x-forwarded-proto': 'http' } })).status === 403);
  check('salud: /health/live responde 200 sin secreto (sondeo del balanceador)', (await hit('/health/live')).status === 200);

  const notFound = await hit('/api/v1/no-existe', { headers: viaEdge });
  check('borde + https: una ruta inexistente llega al backend (404)', notFound.status === 404);
  const missing = Object.entries(SECURITY_HEADERS).filter(([name, value]) => notFound.headers.get(name) !== value).map(([name]) => name);
  check('cabeceras: el 404 lleva todas las cabeceras defensivas con su valor exacto', missing.length === 0, missing.join(', '));
  const rejected = await hit('/api/v1/no-existe');
  check('cabeceras: también el 403 del borde las lleva', Object.entries(SECURITY_HEADERS).every(([name, value]) => rejected.headers.get(name) === value));

  const probes = [
    await hit('/api/v1/no-existe', { method: 'OPTIONS', headers: { ...viaEdge, origin: 'https://ajeno.example.test', 'access-control-request-method': 'POST' } }),
    await hit('/api/v1/no-existe', { method: 'OPTIONS', headers: { ...viaEdge, origin: 'https://app.example.test', 'access-control-request-method': 'POST' } }),
    await hit('/api/v1/no-existe', { headers: { ...viaEdge, origin: 'https://app.example.test' } }),
    await hit('/api/v1/no-existe', { method: 'POST', headers: { ...viaEdge, origin: 'https://ajeno.example.test', 'content-type': 'application/json' }, body: '{}' }),
  ];
  check('CORS: ninguna respuesta lleva Access-Control-* (mismo origen por el rewrite, ADR-004)',
    probes.every((response) => ![...response.headers.keys()].some((name) => name.startsWith('access-control-'))));
  check('CORS: una mutación con Origin ajeno se rechaza (403)', probes[3].status === 403);
  check('no anuncia el framework (sin X-Powered-By ni ETag)', notFound.headers.get('x-powered-by') === null && notFound.headers.get('etag') === null);
} catch (error) {
  failures.push(String(error));
} finally {
  server.kill('SIGTERM');
}

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} comprobación(es) fallida(s).\n`);
  process.exit(1);
}
process.stdout.write('\nTodas las comprobaciones de transporte seguro pasan.\n');
