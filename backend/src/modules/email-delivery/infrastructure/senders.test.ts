import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDevMailboxSender } from './dev-mailbox-sender.js';
import { FakeEmailSender } from './fake-sender.js';
import { createResendSender } from './resend-sender.js';

const MESSAGE = { to: 'donante@example.test', subject: 'Asunto canario', text: 'Texto canario', html: '<p>Html canario</p>', idempotencyKey: 'clave-de-outbox-0001' };

function sender(respond: (init: RequestInit) => Promise<Response> | Response, calls: Array<{ url: string; init: RequestInit }> = []) {
  const fetchStub = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(init); }) as unknown as typeof fetch;
  return createResendSender({ apiKey: 're_clave_de_prueba', from: 'no-responder@example.test', fetch: fetchStub, timeoutMs: 40 });
}

describe('ResendEmailSender', () => {
  it('envía a la API de Resend con Authorization, Idempotency-Key y un cuerpo con from/to/subject/text/html', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await sender(() => new Response(JSON.stringify({ id: 'resend-id-1' }), { status: 200 }), calls).send(MESSAGE);

    expect(result).toEqual({ kind: 'ok', httpStatus: 200, providerMessageId: 'resend-id-1' });
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_clave_de_prueba');
    expect(headers['Idempotency-Key']).toBe('clave-de-outbox-0001');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      from: 'no-responder@example.test', to: ['donante@example.test'], subject: 'Asunto canario', text: 'Texto canario', html: '<p>Html canario</p>',
    });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    // Una redirección nunca se sigue: la clave de API no debe viajar a otro destino.
    expect(calls[0].init.redirect).toBe('error');
  });

  it('un 2xx sin id legible sigue siendo ok', async () => {
    expect(await sender(() => new Response('no es json', { status: 200 })).send(MESSAGE)).toEqual({ kind: 'ok', httpStatus: 200 });
  });

  it.each([[408, 'transitorio'], [429, 'transitorio'], [500, 'transitorio'], [503, 'transitorio'], [400, 'permanente'], [401, 'permanente'], [403, 'permanente'], [422, 'permanente']])(
    'el estado %i se clasifica %s',
    async (status, kind) => {
      expect(await sender(() => new Response('{}', { status })).send(MESSAGE)).toEqual({ kind, httpStatus: status });
    },
  );

  it('409 concurrent_idempotent_requests es transitorio; 409 invalid_idempotent_request es permanente', async () => {
    const concurrent = await sender(() => new Response(JSON.stringify({ name: 'concurrent_idempotent_requests' }), { status: 409 })).send(MESSAGE);
    const invalid = await sender(() => new Response(JSON.stringify({ name: 'invalid_idempotent_request' }), { status: 409 })).send(MESSAGE);

    expect(concurrent.kind).toBe('transitorio');
    expect(invalid.kind).toBe('permanente');
  });

  it('un timeout después de lanzar la petición es incierto (el body pudo salir)', async () => {
    const hanging = (init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

    expect((await sender(hanging).send(MESSAGE)).kind).toBe('incierto');
  });

  it('un fallo de conexión claro antes de enviar es transitorio; un corte posterior es incierto', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });

    expect((await sender(() => Promise.reject(refused)).send(MESSAGE)).kind).toBe('transitorio');
    expect((await sender(() => Promise.reject(reset)).send(MESSAGE)).kind).toBe('incierto');
    expect((await sender(() => Promise.reject(new Error('desconocido'))).send(MESSAGE)).kind).toBe('incierto');
  });

  it('nunca lanza ni filtra destinatario, cuerpo o clave de API en el resultado', async () => {
    const result = await sender(() => Promise.reject(new Error('re_clave_de_prueba donante@example.test'))).send(MESSAGE);

    expect(JSON.stringify(result)).not.toMatch(/re_clave|donante@|canario/);
  });
});

describe('FakeEmailSender', () => {
  it('guarda solo resultado, clave y hora; nunca destinatario, asunto ni cuerpo', async () => {
    const fake = new FakeEmailSender(undefined, () => 1234);

    await fake.send(MESSAGE);

    expect(fake.records).toEqual([{ kind: 'ok', idempotencyKey: 'clave-de-outbox-0001', at: 1234 }]);
    expect(JSON.stringify(fake.records)).not.toMatch(/donante@|canario/);
  });

  it('el guion programa el resultado de cada llamada', async () => {
    const fake = new FakeEmailSender((call) => (call === 1 ? { kind: 'transitorio', httpStatus: 503 } : { kind: 'ok', providerMessageId: `m${call}` }));

    expect((await fake.send(MESSAGE)).kind).toBe('transitorio');
    expect(await fake.send(MESSAGE)).toEqual({ kind: 'ok', providerMessageId: 'm2' });
  });
});

describe('DevMailboxSender', () => {
  it('escribe cada correo como un HTML propio (0600) en un directorio 0700, con destinatario y asunto escapados', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mailbox-'));
    const dir = join(root, 'buzon');
    try {
      const result = await createDevMailboxSender(dir).send({ ...MESSAGE, subject: 'Asunto <b>canario</b>', idempotencyKey: 'clave/../0001' });

      expect(result.kind).toBe('ok');
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('clave____0001.html');
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect((await stat(join(dir, files[0]))).mode & 0o777).toBe(0o600);
      const html = await readFile(join(dir, files[0]), 'utf8');
      expect(html).toContain('donante@example.test');
      expect(html).toContain('Asunto &lt;b&gt;canario&lt;/b&gt;');
      expect(html).toContain('<p>Html canario</p>');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('un reintento con la misma clave no duplica el archivo y sigue siendo ok; un directorio previo queda en 0700', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mailbox-'));
    try {
      const mailbox = createDevMailboxSender(root);
      const first = await mailbox.send(MESSAGE);
      const retry = await mailbox.send(MESSAGE);

      expect(first).toEqual({ kind: 'ok', providerMessageId: 'clave-de-outbox-0001.html' });
      expect(retry).toEqual(first);
      expect(await readdir(root)).toEqual(['clave-de-outbox-0001.html']);
      expect((await stat(root)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('si no puede escribir devuelve transitorio sin lanzar ni filtrar el contenido', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mailbox-'));
    const blocked = join(root, 'archivo');
    try {
      await writeFile(blocked, '');
      const result = await createDevMailboxSender(join(blocked, 'buzon')).send(MESSAGE);

      expect(result).toEqual({ kind: 'transitorio' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
