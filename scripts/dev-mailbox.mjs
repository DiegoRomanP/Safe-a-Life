// Buzón web local (solo desarrollo y datos sintéticos): muestra los correos que guarda EMAIL_PROVIDER=dev-mailbox.
// Cada correo lleva un enlace de un solo uso: solo escucha en 127.0.0.1 y nunca registra su contenido.
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = /^[A-Za-z0-9_-]+\.html$/;
// Una web externa que resuelva su dominio a 127.0.0.1 (DNS rebinding) llega con otro Host y no puede leer el buzón.
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;
/** Rutas de `actionLink` en las plantillas del backend y el texto de su botón. */
const ROUTES = {
  '/verificar-correo': 'Verificar correo',
  '/restablecer-contrasena': 'Crear contraseña',
  '/activar-cuenta': 'Activar cuenta',
  '/cambiar-correo': 'Confirmar cambio de correo',
  '/invitacion-administrador': 'Abrir invitación de administrador',
  '/invitaciones': 'Abrir invitación',
};
const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const CHARACTERS = Object.fromEntries(Object.entries(ENTITIES).map(([character, entity]) => [entity, character]));

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ENTITIES[character]);
const unescapeHtml = (value) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity]);

function actionLinks(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].flatMap(([, raw]) => {
    const href = unescapeHtml(raw);
    const url = URL.parse(href);
    if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hash) return [];
    const route = Object.keys(ROUTES).find((known) => url.pathname.endsWith(known));
    return route ? [{ href, label: ROUTES[route] }] : [];
  });
}

const ignoreMissing = (error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
};

// shortcut: relee todos los correos en cada recarga; si el buzón crece a miles, cachear por mtime.
async function readMessages(dir) {
  const entries = (await readdir(dir, { withFileTypes: true }).catch(ignoreMissing)) ?? [];
  const messages = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && NAME.test(entry.name))
      .map(async ({ name }) => {
        const file = path.join(dir, name);
        try {
          const [html, { mtime }] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
          const [, to = '', subject = ''] =
            /^<p><strong>Para:<\/strong> (.*?)<\/p><p><strong>Asunto:<\/strong> (.*?)<\/p><hr>/s.exec(html) ?? [];
          return { name, time: mtime, to: unescapeHtml(to), subject: unescapeHtml(subject), links: actionLinks(html) };
        } catch (error) {
          return ignoreMissing(error); // Borrado entre el listado y la lectura.
        }
      }),
  );
  return messages.filter(Boolean).sort((a, b) => b.time - a.time);
}

function renderMessage({ name, time, to, subject, links }) {
  const buttons = links
    .map(({ href, label }) => `<a class="accion" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`)
    .join(' ');
  return `<li><h2>${escapeHtml(subject || '(sin asunto)')}</h2>
<p>Para: ${escapeHtml(to)} · <time datetime="${time.toISOString()}">${time.toLocaleString('es-PE')}</time></p>
<p>${buttons} <a href="/m/${name}">Ver correo</a></p></li>`;
}

function renderList(messages, filter) {
  const shown = filter ? messages.filter(({ to }) => to.toLowerCase() === filter.toLowerCase()) : messages;
  let content = `<ul>${shown.map(renderMessage).join('\n')}</ul>`;
  if (messages.length === 0) {
    content = '<p>Todavía no hay correos: arranca <code>npm run dev:worker</code> con EMAIL_PROVIDER=dev-mailbox.</p>';
  } else if (shown.length === 0) content = '<p>No hay correos para ese destinatario. <a href="/">Ver todos</a></p>';
  // Sin recarga automática (WCAG 2.2.1): quitaba el foco. encodeURIComponent deja el filtro seguro dentro del atributo.
  const refresh = filter ? `/?para=${encodeURIComponent(filter)}` : '/';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buzón de desarrollo</title>
<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;overflow-wrap:anywhere}
ul{list-style:none;padding:0}li{border-top:1px solid #ccc}h2{font-size:1.1rem}
.accion{display:inline-block;margin-right:.5rem;padding:.5rem 1rem;border-radius:.5rem;background:#1d4ed8;color:#fff;text-decoration:none}</style>
</head><body><h1>Buzón de desarrollo</h1><p>Solo datos sintéticos. Para ver los correos nuevos: <a class="actualizar" href="${refresh}">Actualizar</a></p>
${content}</body></html>`;
}

async function route(dir, request) {
  if (!LOCAL_HOST.test(request.headers.host ?? '')) return [403, 'Host no permitido.'];
  // Sin normalizar con `new URL`: el nombre llega tal cual y la regex rechaza cualquier `/`, `..` o `%`.
  const [pathname, query] = request.url.split('?');
  if (pathname === '/') return [200, renderList(await readMessages(dir), new URLSearchParams(query).get('para'))];
  const name = pathname.startsWith('/m/') ? pathname.slice(3) : '';
  const message = NAME.test(name) ? await readFile(path.join(dir, name)).catch(ignoreMissing) : null;
  return message ? [200, message] : [404, 'No encontrado.'];
}

export function createMailboxServer(dir) {
  return createServer((request, response) => {
    route(dir, request)
      .catch((error) => {
        console.error(`Buzón de desarrollo: error de lectura (${error.code ?? error.name}).`);
        return [500, 'No se pudo leer el buzón.'];
      })
      .then(([status, body]) => response.writeHead(status, HEADERS).end(body));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    console.error('El buzón de desarrollo no arranca con NODE_ENV=production.');
    process.exit(1);
  }
  const server = createMailboxServer(fileURLToPath(new URL('../backend/.dev-mailbox/', import.meta.url)));
  server.listen(Number(process.env.DEV_MAILBOX_PORT || 4025), '127.0.0.1', () => {
    const { address, port } = server.address();
    console.log(`Buzón de desarrollo: http://${address}:${port}`);
  });
}
