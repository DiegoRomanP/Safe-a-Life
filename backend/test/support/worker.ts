import { randomBytes, randomUUID } from 'node:crypto';
import { buildWorker } from '../../src/composition-worker.js';
import { parseEnv } from '../../src/config/env.js';
import { sealEmailPayload, type EmailPayload } from '../../src/modules/email-delivery/application/email-payload.js';
import type { EmailSender } from '../../src/modules/email-delivery/application/email-sender.js';
import type { EmailKind } from '../../src/modules/email-delivery/templates/index.js';
import { createLogger } from '../../src/shared/observability/logger.js';
import { sql } from './db.js';
import { backendEnvFor, readLocalSupabase } from './local-env.js';

export const WEBHOOK_SECRET = Buffer.alloc(32, 21);
export const WEBHOOK_SECRET_ENV = `whsec_${WEBHOOK_SECRET.toString('base64')}`;
export const TOKEN = 'tok_integracion_abcdefghijklmnop0123456789';

export function workerConfig(overrides: Record<string, string> = {}) {
  return parseEnv(backendEnvFor(readLocalSupabase(), { TRUSTED_PROXIES: '1', ...overrides }));
}

/** Worker real (sesión técnica contra Auth local, RPC reales) con un remitente programable. */
export function startWorker(sender: EmailSender, overrides: Record<string, string> = {}) {
  const logLines: string[] = [];
  const worker = buildWorker(workerConfig(overrides), createLogger((line) => logLines.push(line)), { sender, random: () => 0.5 });
  return { ...worker, logLines };
}

export interface EnqueueOptions {
  readonly kind?: EmailKind;
  readonly payload?: EmailPayload;
  readonly recipientUserEmail?: string;
  readonly notAfter?: string;
}

/** Encola un correo como lo hará un productor: la aplicación cifra con el id del outbox como AAD. */
export function enqueue(options: EnqueueOptions = {}): string {
  const id = randomUUID();
  const config = workerConfig();
  const payload = options.payload ?? { recipient: `destinatario-${id.slice(0, 8)}@example.test`, token: TOKEN };
  const sealed = sealEmailPayload(config.secrets.outboxKeyring, id, payload);
  const recipient = options.recipientUserEmail
    ? `(select id from auth.users where email = '${options.recipientUserEmail}')`
    : 'null';
  sql(`select app.enqueue_email('${id}', '${options.kind ?? 'recuperacion'}', null, ${recipient}, '${sealed}', ${options.notAfter ?? "now() + interval '1 day'"})`);
  return id;
}

export function row(id: string): { status: string; attempts: number; payloadNull: boolean; delivery: string; provider: string } {
  const [status, attempts, payloadNull, delivery, provider] = sql(
    `select status, attempt_count, sealed_payload is null, delivery_state, coalesce(provider_message_id, '') from app.email_outbox where outbox_id = '${id}'`,
  ).split('|');
  return { status, attempts: Number(attempts), payloadNull: payloadNull === 't', delivery, provider };
}

/** Hace debido de inmediato lo que quedó reprogramado a futuro (evita esperar el backoff real). */
export function makeDue(id: string): void {
  sql(`update app.email_outbox set next_attempt_at = now() - interval '1 second' where outbox_id = '${id}' and status = 'pendiente'`);
}

export const randomSuffix = () => randomBytes(4).toString('hex');
