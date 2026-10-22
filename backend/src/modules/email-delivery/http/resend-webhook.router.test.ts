import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from '../../../shared/http/correlation-id.js';
import { createErrorHandler } from '../../../shared/http/errors.js';
import { createWebhookIngester } from '../application/ingest-webhook.js';
import { signWebhook } from '../application/webhook-signature.js';
import { registerResendWebhookRoutes } from './resend-webhook.router.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const SECRET = Buffer.alloc(32, 3);

async function start(ingest: (type: string) => void = () => undefined) {
  const app = express();
  app.use(correlationIdMiddleware);
  const ingester = createWebhookIngester({ gateway: { ingestEvent: async (event) => { ingest(event.type); return { duplicate: false, matched: true }; } }, secret: SECRET });
  registerResendWebhookRoutes(app, { ingester });
  app.use(express.json());
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/email-delivery/webhooks/resend`;
}

function signed(body: string, now = Math.floor(Date.now() / 1000)) {
  const id = 'msg_router_0001';
  const timestamp = String(now);
  return { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signWebhook(SECRET, id, timestamp, body)}` };
}

describe('POST /api/v1/email-delivery/webhooks/resend', () => {
  it('con firma válida responde 204 sin cuerpo y registra el evento', async () => {
    const seen: string[] = [];
    const url = await start((type) => seen.push(type));
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'p1' } });

    const response = await fetch(url, { method: 'POST', headers: signed(body), body });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(seen).toEqual(['email.delivered']);
  });

  it('un evento ignorado también es 204 y no se registra', async () => {
    const seen: string[] = [];
    const url = await start((type) => seen.push(type));
    const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'p1' } });

    expect((await fetch(url, { method: 'POST', headers: signed(body), body })).status).toBe(204);
    expect(seen).toHaveLength(0);
  });

  it('una firma alterada o vencida es 401 sin detalle', async () => {
    const url = await start();
    const body = JSON.stringify({ type: 'email.sent', data: { email_id: 'p1' } });

    const tampered = await fetch(url, { method: 'POST', headers: { ...signed(body), 'svix-signature': 'v1,AAAA' }, body });
    const old = await fetch(url, { method: 'POST', headers: signed(body, Math.floor(Date.now() / 1000) - 400), body });

    expect(tampered.status).toBe(401);
    expect(old.status).toBe(401);
    expect((await old.json()).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('sin cabeceras de firma es 401', async () => {
    const url = await start();

    expect((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  });

  it('otro Content-Type o un query desconocido es 400, y un cuerpo de más de 64 kB también', async () => {
    const url = await start();
    const body = JSON.stringify({ type: 'email.sent', data: { email_id: 'p1' } });

    expect((await fetch(url, { method: 'POST', headers: { ...signed(body), 'content-type': 'text/plain' }, body })).status).toBe(400);
    expect((await fetch(`${url}?x=1`, { method: 'POST', headers: signed(body), body })).status).toBe(400);
    const huge = JSON.stringify({ type: 'email.sent', data: { email_id: 'x'.repeat(70_000) } });
    expect((await fetch(url, { method: 'POST', headers: signed(huge), body: huge })).status).toBe(400);
  });

  it('firma válida con JSON de forma inválida es 400', async () => {
    const url = await start();
    const body = JSON.stringify({ type: 'email.sent' });

    expect((await fetch(url, { method: 'POST', headers: signed(body), body })).status).toBe(400);
  });
});
