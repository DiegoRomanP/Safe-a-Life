import { ApiError } from '../../../shared/http/errors.js';
import { createTechnicalInvoker } from '../../../shared/persistence/technical-rpc.js';
import { asArray, asBoolean, asNullableString, asNumber, asString, closedRecord, oneOf } from '../../../shared/persistence/guards.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type { AttemptRecord, ClaimedMessage, OutboxGateway, ProviderEvent } from '../application/outbox.ports.js';
import { EMAIL_KINDS } from '../templates/index.js';

export function parseClaimed(value: unknown): ClaimedMessage {
  const row = closedRecord(value, ['outboxId', 'kind', 'sealedPayload', 'attemptNo', 'idempotencyKey', 'notAfter', 'recipient']);
  return Object.freeze({
    outboxId: asString(row.outboxId),
    kind: oneOf(row.kind, EMAIL_KINDS),
    sealedPayload: asString(row.sealedPayload),
    attemptNo: asNumber(row.attemptNo),
    idempotencyKey: asString(row.idempotencyKey),
    notAfter: asString(row.notAfter),
    recipient: asNullableString(row.recipient),
  });
}

/**
 * Adaptador RPC del worker: nombres de función SQL y argumentos `p_*` viven solo aquí. Cada llamada usa el JWT
 * de la sesión técnica (identidad `worker`); nunca `service_role`.
 */
export function createOutboxRpcGateway(rpc: RpcInvoker, accessToken: () => Promise<string>, invalidate: () => void = () => undefined): OutboxGateway {
  const call = createTechnicalInvoker(rpc, accessToken, invalidate);

  return {
    async claim(limit) {
      const reply = await call({ accessToken: null, name: 'worker_claim_due_outbox', okKinds: ['ok'], args: { p_limit: limit } });
      return Object.freeze(asArray(reply.items).map(parseClaimed));
    },

    async recordAttempt(record: AttemptRecord) {
      try {
        await call({
          accessToken: null, name: 'worker_record_attempt', okKinds: ['ok'],
          args: {
            p_outbox_id: record.outboxId, p_attempt_no: record.attemptNo, p_outcome: record.outcome, p_http_status: record.httpStatus,
            p_provider_message_id: record.providerMessageId, p_next_attempt_at: record.nextAttemptAt?.toISOString() ?? null,
          },
        });
        return true;
      } catch (error) {
        // `conflict` = intento obsoleto (la fila ya la reclamó otro worker): se ignora.
        if (error instanceof ApiError && error.code === 'STATE_CONFLICT') return false;
        throw error;
      }
    },

    async expire() {
      const reply = await call({ accessToken: null, name: 'worker_expire_outbox', okKinds: ['ok'], args: {} });
      return Object.freeze({ expired: asNumber(reply.expired), exhausted: asNumber(reply.exhausted) });
    },

    async ingestEvent(event: ProviderEvent) {
      const reply = await call({
        accessToken: null, name: 'ingest_email_event', okKinds: ['ok'],
        args: { p_event_id: event.eventId, p_provider_message_id: event.providerMessageId, p_type: event.type, p_occurred_at: event.occurredAt.toISOString() },
      });
      return Object.freeze({ duplicate: asBoolean(reply.duplicate), matched: reply.matched === undefined ? false : asBoolean(reply.matched) });
    },
  };
}
