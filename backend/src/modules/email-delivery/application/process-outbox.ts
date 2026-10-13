import { SealedPayloadError, type OutboxKeyring } from '../../../shared/crypto/outbox-cipher.js';
import { nextDelayMs } from '../domain/retry-policy.js';
import type { EmailSender, SendResult } from './email-sender.js';
import { openEmailPayload, renderEmail } from './email-payload.js';
import type { AttemptRecord, ClaimedMessage, OutboxGateway } from './outbox.ports.js';

export interface OutboxProcessorDependencies {
  readonly gateway: OutboxGateway;
  readonly sender: EmailSender;
  readonly keyring: OutboxKeyring;
  readonly appPublicUrl: string;
  /**
   * RF-EML-04: bandejas permitidas. `null` = sin restricción (solo con el remitente falso); un conjunto vacío no
   * permite nada (falla cerrado).
   */
  readonly inboxAllowlist: ReadonlySet<string> | null;
  readonly now?: () => number;
  readonly random?: () => number;
}

export type BatchSummary = Readonly<{ claimed: number; sent: number; failed: number; retried: number; skipped: number }>;

const PERMANENT: Pick<SendResult, 'kind'> = { kind: 'permanente' };

/**
 * Procesa un lote del outbox: reclama, descifra, comprueba la allowlist, renderiza, envía y registra cada intento.
 * No registra destinatario, asunto ni token. Un fallo inesperado en un mensaje no detiene el resto: su lease
 * vence y se recupera en un ciclo posterior.
 */
export function createOutboxProcessor({
  gateway, sender, keyring, appPublicUrl, inboxAllowlist, now = Date.now, random = Math.random,
}: OutboxProcessorDependencies) {
  const attempt = (message: ClaimedMessage, result: SendResult): AttemptRecord => {
    const delay = result.kind === 'transitorio' || result.kind === 'incierto' ? nextDelayMs(message.attemptNo, random()) : null;
    return {
      outboxId: message.outboxId,
      attemptNo: message.attemptNo,
      outcome: result.kind,
      httpStatus: result.httpStatus ?? null,
      providerMessageId: result.providerMessageId ?? null,
      nextAttemptAt: delay === null ? null : new Date(now() + delay),
    };
  };

  /** Decide el resultado de un mensaje; solo llama al proveedor si todo lo anterior es válido. */
  const deliver = async (message: ClaimedMessage): Promise<SendResult> => {
    let to: string;
    let email;
    try {
      const payload = openEmailPayload(keyring, message.outboxId, message.sealedPayload);
      const recipient = message.recipient ?? payload.recipient;
      if (recipient === undefined || recipient === null) return PERMANENT as SendResult;
      to = recipient;
      email = renderEmail(message.kind, payload, appPublicUrl);
    } catch (error) {
      if (error instanceof SealedPayloadError) return PERMANENT as SendResult;
      throw error;
    }
    if (inboxAllowlist !== null && !inboxAllowlist.has(to.toLowerCase())) return PERMANENT as SendResult;
    return sender.send({ to, subject: email.subject, text: email.text, html: email.html, idempotencyKey: message.idempotencyKey });
  };

  return Object.freeze({
    async runOnce(limit = 10): Promise<BatchSummary> {
      const messages = await gateway.claim(limit);
      let sent = 0;
      let failed = 0;
      let retried = 0;
      let skipped = 0;
      for (const message of messages) {
        try {
          const result = await deliver(message);
          const applied = await gateway.recordAttempt(attempt(message, result));
          if (!applied) skipped += 1;
          else if (result.kind === 'ok') sent += 1;
          else if (result.kind === 'permanente') failed += 1;
          else retried += 1;
        } catch {
          skipped += 1;
        }
      }
      return { claimed: messages.length, sent, failed, retried, skipped };
    },
  });
}

export type OutboxProcessor = ReturnType<typeof createOutboxProcessor>;
