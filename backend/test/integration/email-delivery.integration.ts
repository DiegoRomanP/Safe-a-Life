import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailSender, SendResult } from '../../src/modules/email-delivery/application/email-sender.js';
import { signWebhook } from '../../src/modules/email-delivery/application/webhook-signature.js';
import { advance, type DeliveryEvent, type DeliveryState } from '../../src/modules/email-delivery/domain/delivery-state.js';
import { FakeEmailSender } from '../../src/modules/email-delivery/infrastructure/fake-sender.js';
import { startBackend, type RunningBackend } from '../support/app.js';
import { observed, observedFetch } from '../support/client.js';
import { undeclaredStatuses } from '../support/contract-statuses.js';
import { sql } from '../support/db.js';
import { SEED_USERS } from '../support/local-env.js';
import { WEBHOOK_SECRET, WEBHOOK_SECRET_ENV, TOKEN, enqueue, makeDue, row, startWorker } from '../support/worker.js';

const WEBHOOK = '/api/v1/email-delivery/webhooks/resend';

beforeAll(() => {
  sql('delete from app.email_outbox; delete from app.email_webhook_events');
});

/** Remitente programable que además recuerda el destinatario SOLO dentro de la prueba (el real nunca lo guarda). */
class ScriptedSender implements EmailSender {
  readonly sent: Array<Pick<EmailMessage, 'to' | 'idempotencyKey'>> = [];
  constructor(private readonly script: (call: number) => SendResult = (call) => ({ kind: 'ok', providerMessageId: `prov-${call}`, httpStatus: 200 })) {}

  async send(message: EmailMessage): Promise<SendResult> {
    this.sent.push({ to: message.to, idempotencyKey: message.idempotencyKey });
    return this.script(this.sent.length);
  }
}

describe('worker: envío y estado final', () => {
  it('envía, destruye el payload cifrado y deja la entrega en enviada con el id del proveedor', async () => {
    const id = enqueue();
    const sender = new ScriptedSender();

    const summary = await startWorker(sender).processor.runOnce(50);

    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(row(id)).toEqual({ status: 'enviado', attempts: 1, payloadNull: true, delivery: 'enviada', provider: expect.stringMatching(/^prov-/) });
    expect(sender.sent.filter((call) => call.idempotencyKey === `outbox-${id}`)).toHaveLength(1);
  });

  it('el payload cifrado en la base no contiene el token ni el destinatario en claro', () => {
    const id = enqueue({ payload: { recipient: 'secreto-visible@example.test', token: TOKEN } });

    const stored = sql(`select sealed_payload from app.email_outbox where outbox_id = '${id}'`);

    expect(stored).toMatch(/^v1\.k1\./);
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain('secreto-visible');
    sql(`delete from app.email_outbox where outbox_id = '${id}'`);
  });

  it('para una invitación el destinatario sale de auth.users, no del payload', async () => {
    const id = enqueue({ kind: 'invitacion', recipientUserEmail: SEED_USERS.donor1.email, payload: { token: TOKEN, hospitalName: 'Hospital Demo Uno', sitePublicName: 'Sede Central Uno', deadline: '14 de octubre de 2026' } });
    const sender = new ScriptedSender();

    await startWorker(sender).processor.runOnce(50);

    expect(sender.sent.find((call) => call.idempotencyKey === `outbox-${id}`)?.to).toBe(SEED_USERS.donor1.email);
    expect(row(id).status).toBe('enviado');
  });

  it('un transitorio se reintenta con la misma clave de idempotencia y termina enviado (2 intentos)', async () => {
    const id = enqueue();
    const sender = new ScriptedSender((call) => (call === 1 ? { kind: 'transitorio', httpStatus: 503 } : { kind: 'ok', providerMessageId: 'prov-retry' }));
    const worker = startWorker(sender);

    await worker.processor.runOnce(50);
    expect(row(id)).toMatchObject({ status: 'pendiente', attempts: 1, payloadNull: false });
    makeDue(id);
    await worker.processor.runOnce(50);

    expect(row(id)).toMatchObject({ status: 'enviado', attempts: 2, payloadNull: true, provider: 'prov-retry' });
    const keys = sender.sent.filter((call) => call.idempotencyKey === `outbox-${id}`);
    expect(keys).toHaveLength(2);
  });

  it('máximo 6 llamadas: tras el sexto transitorio queda fallido y con payload destruido', async () => {
    const id = enqueue();
    const sender = new ScriptedSender(() => ({ kind: 'transitorio', httpStatus: 503 }));
    const worker = startWorker(sender);

    for (let i = 0; i < 9; i += 1) {
      makeDue(id);
      await worker.processor.runOnce(50);
    }

    const mine = sender.sent.filter((call) => call.idempotencyKey === `outbox-${id}`);
    expect(mine).toHaveLength(6);
    expect(row(id)).toMatchObject({ status: 'fallido', attempts: 6, payloadNull: true, delivery: 'fallida' });
    expect(Number(sql(`select count(*) from app.email_attempts where outbox_id = '${id}'`))).toBe(6);
  });

  it('un error permanente falla de inmediato sin más intentos', async () => {
    const id = enqueue();
    const sender = new ScriptedSender(() => ({ kind: 'permanente', httpStatus: 422 }));

    await startWorker(sender).processor.runOnce(50);

    expect(row(id)).toMatchObject({ status: 'fallido', attempts: 1, payloadNull: true, delivery: 'fallida' });
  });

  it('un resultado incierto se reconcilia a los ~30 s con la misma clave', async () => {
    const id = enqueue();
    const sender = new ScriptedSender(() => ({ kind: 'incierto' }));

    await startWorker(sender).processor.runOnce(50);

    expect(row(id)).toMatchObject({ status: 'pendiente', attempts: 1, payloadNull: false });
    const seconds = Number(sql(`select extract(epoch from next_attempt_at - now())::int from app.email_outbox where outbox_id = '${id}'`));
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThanOrEqual(31);
    expect(sql(`select uncertain_since is not null from app.email_outbox where outbox_id = '${id}'`)).toBe('t');
  });

  it('nada se envía después de not_after: la fila vence con el payload destruido', async () => {
    const id = enqueue();
    sql(`update app.email_outbox set not_after = now() - interval '1 second' where outbox_id = '${id}'`);
    const sender = new ScriptedSender();
    const worker = startWorker(sender);

    await worker.processor.runOnce(50);
    const expired = await worker.gateway.expire();

    expect(sender.sent.filter((call) => call.idempotencyKey === `outbox-${id}`)).toHaveLength(0);
    expect(expired.expired).toBeGreaterThanOrEqual(1);
    expect(row(id)).toMatchObject({ status: 'vencido', payloadNull: true });
  });

  it('un reintento transitorio cuyo retardo supera not_after queda fallido (no se programa fuera del plazo)', async () => {
    const id = enqueue({ notAfter: "now() + interval '10 seconds'" });
    const sender = new ScriptedSender(() => ({ kind: 'transitorio', httpStatus: 503 }));

    await startWorker(sender).processor.runOnce(50);

    expect(row(id)).toMatchObject({ status: 'fallido', payloadNull: true });
  });

  it('la allowlist impide llamar al proveedor: un destinatario fuera de la lista queda fallido sin envío', async () => {
    const id = enqueue({ payload: { recipient: 'bloqueado@example.test', token: TOKEN } });
    const sender = new ScriptedSender();
    const worker = startWorker(sender, {
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_clave_de_prueba', RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET_ENV,
      EMAIL_INBOX_ALLOWLIST: 'permitido@example.test', APP_PUBLIC_URL: 'https://app.example.test',
    });

    await worker.processor.runOnce(50);

    expect(sender.sent.filter((call) => call.idempotencyKey === `outbox-${id}`)).toHaveLength(0);
    expect(row(id)).toMatchObject({ status: 'fallido', attempts: 1, payloadNull: true });
  });
});

describe('worker: concurrencia', () => {
  it('dos workers concurrentes no reclaman la misma fila: cada clave se envía exactamente una vez', async () => {
    sql('delete from app.email_outbox');
    const ids = Array.from({ length: 12 }, () => enqueue());
    const a = new ScriptedSender();
    const b = new ScriptedSender();

    // Seis cada uno: sin solaparse, SKIP LOCKED reparte las 12 filas; con otro reparto habría duplicados o faltantes.
    await Promise.all([startWorker(a).processor.runOnce(6), startWorker(b).processor.runOnce(6)]);

    expect(a.sent).toHaveLength(6);
    expect(b.sent).toHaveLength(6);
    const keys = [...a.sent, ...b.sent].map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    expect(new Set(ids.map((id) => `outbox-${id}`))).toEqual(new Set(keys));
    for (const id of ids) expect(row(id)).toMatchObject({ status: 'enviado', attempts: 1 });
  });

  it('un lease vencido (worker caído) se recupera por otro worker como segunda llamada', async () => {
    const id = enqueue();
    sql(`update app.email_outbox set status = 'en_curso', attempt_count = 1, lease_until = now() - interval '1 second' where outbox_id = '${id}'`);
    const sender = new ScriptedSender();

    await startWorker(sender).processor.runOnce(50);

    expect(row(id)).toMatchObject({ status: 'enviado', attempts: 2 });
  });
});

describe('webhook de Resend contra el backend real', () => {
  let backend: RunningBackend;
  let outboxId: string;
  const providerId = `prov-int-${randomUUID()}`;

  beforeAll(async () => {
    backend = await startBackend({ RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET_ENV });
    outboxId = enqueue();
    await startWorker(new ScriptedSender(() => ({ kind: 'ok', providerMessageId: providerId }))).processor.runOnce(50);
    expect(row(outboxId).provider).toBe(providerId);
  });

  afterAll(async () => {
    await backend.close();
  });

  const event = (type: string, emailId = providerId) => JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: emailId, to: ['secreto@example.test'] } });
  const post = (body: string, overrides: { id?: string; timestamp?: string; signature?: string } = {}) => {
    const id = overrides.id ?? `msg_${randomUUID()}`;
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    return observedFetch(backend.baseUrl, WEBHOOK, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp,
        'svix-signature': overrides.signature ?? `v1,${signWebhook(WEBHOOK_SECRET, id, timestamp, body)}`,
      },
      body,
    });
  };

  it('delivered con firma válida avanza la entrega a entregada', async () => {
    expect((await post(event('email.delivered'))).status).toBe(204);

    expect(row(outboxId).delivery).toBe('entregada');
  });

  it('delivered antes que sent no retrocede: un sent posterior no cambia la entrega', async () => {
    expect((await post(event('email.sent'))).status).toBe(204);

    expect(row(outboxId).delivery).toBe('entregada');
  });

  it('un webhook duplicado (mismo svix-id) tiene un solo efecto', async () => {
    const id = `msg_dup_${randomUUID()}`;
    const body = event('email.sent');

    expect((await post(body, { id })).status).toBe(204);
    expect((await post(body, { id })).status).toBe(204);

    expect(Number(sql(`select count(*) from app.email_webhook_events where event_id = '${id}'`))).toBe(1);
  });

  it('un rebote posterior a la entrega no la invalida; un rebote antes sí la marca fallida', async () => {
    expect((await post(event('email.bounced'))).status).toBe(204);
    expect(row(outboxId).delivery).toBe('entregada');

    const early = enqueue();
    const earlyProvider = `prov-early-${randomUUID()}`;
    await startWorker(new ScriptedSender(() => ({ kind: 'ok', providerMessageId: earlyProvider }))).processor.runOnce(50);
    expect((await post(event('email.failed', earlyProvider))).status).toBe(204);
    expect(row(early).delivery).toBe('fallida');
  });

  it('firma alterada, marca vieja o futura y cabeceras ausentes son 401', async () => {
    const body = event('email.delivered');
    const stale = String(Math.floor(Date.now() / 1000) - 400);
    const future = String(Math.floor(Date.now() / 1000) + 400);

    expect((await post(body, { signature: 'v1,AAAA' })).status).toBe(401);
    expect((await post(body, { timestamp: stale })).status).toBe(401);
    expect((await post(body, { timestamp: future })).status).toBe(401);
    expect((await observedFetch(backend.baseUrl, WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status).toBe(401);
  });

  it('una firma válida con un cuerpo alterado después de firmar es 401', async () => {
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = event('email.delivered');
    const tampered = signed.replace('email.delivered', 'email.bounced');

    const response = await observedFetch(backend.baseUrl, WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signWebhook(WEBHOOK_SECRET, id, timestamp, signed)}` },
      body: tampered,
    });

    expect(response.status).toBe(401);
  });

  it('JSON inválido o con forma inválida pero firmado es 400; un evento desconocido es 204 sin efecto', async () => {
    const before = Number(sql('select count(*) from app.email_webhook_events'));

    expect((await post('{ no es json')).status).toBe(400);
    expect((await post(JSON.stringify({ type: 'email.sent' }))).status).toBe(400);
    expect((await post(event('email.opened'))).status).toBe(204);

    expect(Number(sql('select count(*) from app.email_webhook_events'))).toBe(before);
  });

  it('un evento que llega ANTES de que el worker conozca el id del proveedor se reaplica al registrarlo', async () => {
    const early = `prov-antes-${randomUUID()}`;
    const id = enqueue();
    sql(`update app.email_outbox set status = 'en_curso', attempt_count = 1, lease_until = now() + interval '60 seconds' where outbox_id = '${id}'`);

    expect((await post(event('email.delivered', early))).status).toBe(204);
    expect(row(id).delivery).toBe('pendiente');
    const worker = startWorker(new ScriptedSender());
    await worker.gateway.recordAttempt({ outboxId: id, attemptNo: 1, outcome: 'ok', httpStatus: 200, providerMessageId: early, nextAttemptAt: null });

    expect(row(id)).toMatchObject({ status: 'enviado', delivery: 'entregada', provider: early });
  });

  it('un evento de un mensaje desconocido se acepta sin efecto sobre ningún outbox', async () => {
    expect((await post(event('email.delivered', `prov-desconocido-${randomUUID()}`))).status).toBe(204);
  });

  it('la tabla de eventos guarda solo id, tipo y mensaje del proveedor, nunca destinatarios ni cuerpo', () => {
    const stored = sql('select event_id || type || coalesce(provider_message_id, \'\') from app.email_webhook_events');

    expect(stored).not.toContain('secreto@example.test');
  });

  it('con el webhook deshabilitado (sin secreto) la ruta no existe: 404', async () => {
    const plain = await startBackend();
    try {
      // fetch directo: el 404 de una ruta deshabilitada no forma parte del contrato de la operación.
      const response = await fetch(`${plain.baseUrl}${WEBHOOK}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(response.status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});

describe('paridad TS ↔ SQL del avance de entrega', () => {
  it('app.advance_delivery coincide con advance() para las 12 combinaciones', () => {
    const states: DeliveryState[] = ['pendiente', 'enviada', 'entregada', 'fallida'];
    const events: DeliveryEvent[] = ['enviada', 'entregada', 'fallida'];
    const mismatches: string[] = [];
    for (const state of states) {
      for (const event of events) {
        const fromSql = sql(`select app.advance_delivery('${state}', '${event}')`);
        if (fromSql !== advance(state, event)) mismatches.push(`${state} + ${event}: SQL ${fromSql}, TS ${advance(state, event)}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe('estado terminal y observabilidad', () => {
  it('todo mensaje en estado final tiene el payload destruido', () => {
    expect(sql(`select count(*) from app.email_outbox where status in ('enviado','fallido','cancelado','vencido') and sealed_payload is not null`)).toBe('0');
  });

  it('el worker solo registra evento, código y duración (sin destinatario, asunto ni token)', async () => {
    const worker = startWorker(new FakeEmailSender());
    enqueue({ payload: { recipient: 'visible-en-logs@example.test', token: TOKEN } });

    await worker.loop.tick();

    const logs = worker.logLines.join('\n');
    expect(logs).toContain('worker.ciclo');
    expect(logs).not.toMatch(/visible-en-logs|tok_integracion|Restablece/);
    for (const line of worker.logLines) expect(Object.keys(JSON.parse(line)).sort()).toEqual(['code', 'durationMs', 'event', 'level', 'time'].sort());
  });

  it('todo estado HTTP devuelto por el webhook está declarado en docs/openapi.json', () => {
    expect(observed.length).toBeGreaterThan(10);
    expect(undeclaredStatuses()).toEqual([]);
  });
});

