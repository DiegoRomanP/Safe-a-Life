import { describe, expect, it } from 'vitest';
import { createWebhookIngester } from './ingest-webhook.js';
import type { ProviderEvent } from './outbox.ports.js';
import { signWebhook } from './webhook-signature.js';

const SECRET = Buffer.alloc(32, 5);
const NOW_MS = 1_760_000_000_000;
const ID = 'msg_sintetico_0001';

function harness() {
  const events: ProviderEvent[] = [];
  const ingester = createWebhookIngester({
    gateway: { ingestEvent: async (event) => { events.push(event); return { duplicate: false, matched: true }; } },
    secret: SECRET,
    now: () => NOW_MS,
  });
  const send = (body: unknown, overrides: { id?: string; timestamp?: string; signature?: string } = {}) => {
    const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const timestamp = overrides.timestamp ?? String(NOW_MS / 1000);
    const id = overrides.id ?? ID;
    return ingester.handle({ id, timestamp, signature: overrides.signature ?? `v1,${signWebhook(SECRET, id, timestamp, raw)}` }, raw);
  };
  return { events, send };
}

const EVENT = (type: string) => ({ type, created_at: '2026-10-13T12:00:00.000Z', data: { email_id: 'prov-001', to: ['x@example.test'], subject: 'secreto' } });

describe('ingestión del webhook de Resend', () => {
  it.each(['email.sent', 'email.delivered', 'email.bounced', 'email.failed'])('%s con firma válida se acepta y se registra solo id, tipo y hora', async (type) => {
    const { events, send } = harness();

    expect(await send(EVENT(type))).toBe('accepted');
    expect(events).toEqual([{ eventId: ID, providerMessageId: 'prov-001', type, occurredAt: new Date('2026-10-13T12:00:00.000Z') }]);
    expect(JSON.stringify(events)).not.toMatch(/x@example\.test|secreto/);
  });

  it.each(['email.opened', 'email.clicked', 'email.delivery_delayed', 'email.complained'])('%s se ignora sin llamar a la base', async (type) => {
    const { events, send } = harness();

    expect(await send(EVENT(type))).toBe('ignored');
    expect(events).toHaveLength(0);
  });

  it('una firma inválida o una marca antigua es invalid_signature y no parsea ni registra nada', async () => {
    const { events, send } = harness();

    expect(await send(EVENT('email.sent'), { signature: 'v1,AAAA' })).toBe('invalid_signature');
    expect(await send(EVENT('email.sent'), { timestamp: String(NOW_MS / 1000 - 301) })).toBe('invalid_signature');
    expect(await send('esto no es json { firmado ok'.padEnd(10), { signature: 'v1,AAAA' })).toBe('invalid_signature');
    expect(events).toHaveLength(0);
  });

  it('con firma válida pero JSON inválido o forma inválida es bad_request', async () => {
    const { events, send } = harness();

    expect(await send('{ no es json')).toBe('bad_request');
    expect(await send({ type: 'email.sent' })).toBe('bad_request');
    expect(await send({ type: 'email.sent', data: {} })).toBe('bad_request');
    expect(await send({ type: 'email.sent', data: { email_id: 7 } })).toBe('bad_request');
    expect(await send([])).toBe('bad_request');
    expect(events).toHaveLength(0);
  });

  it('un created_at inválido usa la hora actual', async () => {
    const { events, send } = harness();

    await send({ type: 'email.sent', created_at: 'ayer', data: { email_id: 'p' } });

    expect(events[0].occurredAt.getTime()).toBe(NOW_MS);
  });
});
