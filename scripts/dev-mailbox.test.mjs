// node:test del buzón web local. Solo usa directorios temporales y datos sintéticos (nunca el .dev-mailbox real).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMailboxServer } from './dev-mailbox.mjs';

const script = fileURLToPath(new URL('./dev-mailbox.mjs', import.meta.url));
// Armado en código: un literal largo junto a «token» lo marca gitleaks como secreto en el CI.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');
const WEB = 'http://127.0.0.1:5174';
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'";

let root;
let dir;
let server;

/** Mismo formato que dev-mailbox-sender.ts: cabecera ya escapada seguida del HTML de la plantilla. */
async function mail(name, { to, subject, links = [] }, seconds) {
  const body = links.map((url) => `<p><a href="${url}">${url}</a></p>`).join('\n');
  const file = path.join(dir, name);
  await writeFile(file, `<p><strong>Para:</strong> ${to}</p><p><strong>Asunto:</strong> ${subject}</p><hr>${body}`);
  await utimes(file, seconds, seconds);
}

function get(target, requestPath, headers) {
  return new Promise((resolve, reject) => {
    // `path` se envía tal cual: fetch normalizaría los `../` antes de salir.
    request({ host: '127.0.0.1', port: target.address().port, path: requestPath, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', reject).end();
  });
}

async function listen(mailboxDir) {
  const instance = createMailboxServer(mailboxDir);
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  return instance;
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sal-buzon-'));
  dir = path.join(root, 'buzon');
  await mkdir(dir);
  await writeFile(path.join(root, 'fuera.html'), 'FUERA-DEL-BUZON');
  // El nombre alfabético no coincide con el orden temporal.
  await mail('a-antiguo.html', {
    to: 'donante.uno@example.test',
    subject: 'Verifica tu correo',
    links: [`${WEB}/verificar-correo#${TOKEN}`],
  }, 1_000_000);
  await mail('z-medio.html', {
    to: 'donante.dos@example.test',
    subject: '<script>alert(1)</script> &amp; &lt;b&gt;',
    links: [
      `javascript:alert(1)//restablecer-contrasena#${TOKEN}`,
      `${WEB}/ruta-desconocida#${TOKEN}`,
      `${WEB}/restablecer-contrasena`,
    ],
  }, 2_000_000);
  await mail('m-nuevo.html', {
    to: 'donante.uno@example.test',
    subject: 'Crea tu contraseña',
    links: ['/restablecer-contrasena', '/activar-cuenta', '/cambiar-correo', '/invitacion-administrador', '/invitaciones']
      .map((route) => `${WEB}${route}#${TOKEN}`),
  }, 3_000_000);
  await writeFile(path.join(dir, 'notas.txt'), 'NO-ES-CORREO');
  server = await listen(dir);
});

after(async () => {
  server?.close();
  await rm(root, { recursive: true, force: true });
});

test('lista solo los .html, del más nuevo al más antiguo, con Para, Asunto y hora', async () => {
  const { status, body } = await get(server, '/');
  assert.equal(status, 200);
  const order = [...body.matchAll(/href="\/m\/([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['m-nuevo.html', 'z-medio.html', 'a-antiguo.html']);
  assert.match(body, /donante\.uno@example\.test/);
  assert.match(body, /Crea tu contraseña/);
  assert.match(body, /<time datetime="1970-01-12T13:46:40\.000Z">/);
  assert.doesNotMatch(body, /notas\.txt/);
});

// WCAG 2.2.1 y 2.2.2: la página no se recarga sola (quitaría el foco); la persona pide los correos nuevos.
test('no se recarga sola y ofrece «Actualizar» conservando el filtro', async () => {
  for (const [requestPath, target] of [
    ['/', '/'],
    ['/?para=donante.dos%40example.test', '/?para=donante.dos%40example.test'],
    ['/?para=%22%3E%3Cscript%3E', '/?para=%22%3E%3Cscript%3E'],
  ]) {
    const { body } = await get(server, requestPath);
    assert.doesNotMatch(body, /http-equiv="refresh"|cada 5 segundos|<script/, requestPath);
    assert.ok(body.includes(`<a class="actualizar" href="${target}">Actualizar</a>`), requestPath);
  }
});

test('pinta un botón por cada enlace a una ruta conocida y descarta el resto', async () => {
  const { body } = await get(server, '/');
  const actions = [...body.matchAll(/class="accion" href="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(actions, [
    [`${WEB}/restablecer-contrasena#${TOKEN}`, 'Crear contraseña'],
    [`${WEB}/activar-cuenta#${TOKEN}`, 'Activar cuenta'],
    [`${WEB}/cambiar-correo#${TOKEN}`, 'Confirmar cambio de correo'],
    [`${WEB}/invitacion-administrador#${TOKEN}`, 'Abrir invitación de administrador'],
    [`${WEB}/invitaciones#${TOKEN}`, 'Abrir invitación'],
    [`${WEB}/verificar-correo#${TOKEN}`, 'Verificar correo'],
  ]);
  assert.doesNotMatch(body, /javascript:|ruta-desconocida/);
});

test('?para= filtra por destinatario', async () => {
  const { body } = await get(server, '/?para=Donante.Dos%40example.test');
  assert.match(body, /z-medio\.html/);
  assert.doesNotMatch(body, /m-nuevo\.html|a-antiguo\.html/);
  const none = await get(server, '/?para=nadie%40example.test');
  assert.doesNotMatch(none.body, /href="\/m\//);
  assert.match(none.body, /No hay correos para ese destinatario/);
});

test('escapa todo lo que pinta, sin doble escape de lo que ya venía escapado', async () => {
  const { body } = await get(server, '/?para=donante.dos%40example.test');
  assert.doesNotMatch(body, /<script|<b>/);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &lt;b&gt;/);
});

test('explica cómo llenar el buzón si el directorio está vacío o no existe', async () => {
  const empty = path.join(root, 'vacio');
  await mkdir(empty);
  for (const mailboxDir of [empty, path.join(root, 'no-existe')]) {
    const other = await listen(mailboxDir);
    const { status, body } = await get(other, '/');
    other.close();
    assert.equal(status, 200);
    assert.match(body, /npm run dev:worker/);
    assert.match(body, /EMAIL_PROVIDER=dev-mailbox/);
  }
});

test('sirve el correo guardado y toda respuesta lleva las cabeceras de seguridad', async () => {
  const message = await get(server, '/m/a-antiguo.html');
  assert.equal(message.status, 200);
  assert.match(message.body, /Verifica tu correo/);
  assert.equal(message.headers['content-type'], 'text/html; charset=utf-8');
  for (const response of [message, await get(server, '/'), await get(server, '/m/no-existe.html')]) {
    assert.equal(response.headers['content-security-policy'], CSP);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('responde 404 ante path traversal, nombres inválidos y rutas desconocidas', async () => {
  for (const requestPath of [
    '/m/../fuera.html',
    '/m/..%2Ffuera.html',
    '/m/%2e%2e%2ffuera.html',
    '/m/..\\fuera.html',
    '/m//etc/passwd',
    '/m/notas.txt',
    '/m/a-antiguo.html.bak',
    '/m/a-antiguo%2Ehtml',
    '/m/.html',
    '/m/',
    '/m/no-existe.html',
    '/fuera.html',
  ]) {
    const { status, body } = await get(server, requestPath);
    assert.equal(status, 404, requestPath);
    assert.doesNotMatch(body, /FUERA-DEL-BUZON|NO-ES-CORREO/, requestPath);
  }
});

test('rechaza un Host que no sea local (DNS rebinding)', async () => {
  for (const requestPath of ['/', '/m/a-antiguo.html']) {
    const { status, body } = await get(server, requestPath, { host: 'atacante.example.test:4025' });
    assert.equal(status, 403, requestPath);
    assert.doesNotMatch(body, /example\.test|tok_sintetico/);
  }
  assert.equal((await get(server, '/', { host: 'localhost:4025' })).status, 200);
});

test('se niega a arrancar con NODE_ENV=production', () => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, NODE_ENV: 'production', DEV_MAILBOX_PORT: '0' },
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production/);
  assert.equal(result.stdout, '');
});

test('ejecutado directamente escucha solo en 127.0.0.1', async () => {
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, NODE_ENV: 'development', DEV_MAILBOX_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    const [line] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5_000) });
    assert.match(String(line), /http:\/\/127\.0\.0\.1:\d+/);
  } finally {
    child.kill();
  }
});
