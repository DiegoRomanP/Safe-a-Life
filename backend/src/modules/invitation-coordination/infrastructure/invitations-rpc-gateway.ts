import { asNumber, asString, closedRecord, oneOf } from '../../../shared/persistence/guards.js';
import { pageOf } from '../../../shared/persistence/page.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { NEED_STATUSES } from '../../need-records/domain/need-state.js';
import type {
  ActionPreview, BatchResult, ConfirmedResponse, DeliveryCounts, InvitationBatchView, InvitationItem, InvitationResponseResult,
  InvitationsRepository, OpaqueResponse, OwnInvitationDetail, ResponseHistoryItem,
} from '../application/invitations.ports.js';

const BLOOD_TYPES = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'] as const;
const URGENCIES = ['Normal', 'Urgente', 'Critica'] as const;
const VALIDITY = ['activa', 'invalidada', 'vencida'] as const;
const DELIVERY = ['pendiente', 'enviada', 'entregada', 'fallida'] as const;
const RESPONSE = ['sin_respuesta', 'confirmada', 'rechazada'] as const;

function parseCounts(value: unknown): DeliveryCounts {
  const row = closedRecord(value, DELIVERY);
  return Object.freeze({ pendiente: asNumber(row.pendiente), enviada: asNumber(row.enviada), entregada: asNumber(row.entregada), fallida: asNumber(row.fallida) });
}

const parseBatch = (value: unknown): InvitationBatchView => {
  const row = closedRecord(value, ['batchId', 'createdAt', 'createdInvitationCount', 'deliveryCounts']);
  return Object.freeze({
    batchId: asString(row.batchId), createdAt: asString(row.createdAt), createdInvitationCount: asNumber(row.createdInvitationCount),
    deliveryCounts: parseCounts(row.deliveryCounts),
  });
};

/** Confirmada (con nombre y grupo) u opaca: la forma cerrada de cada variante impide que se cuele otro dato. */
function parseNeedResponse(value: unknown): ConfirmedResponse | OpaqueResponse {
  if (typeof value === 'object' && value !== null && (value as { response?: unknown }).response === 'confirmada') {
    const row = closedRecord(value, ['needDonorCode', 'donorName', 'declaredBloodType', 'response', 'responseRecordedAt']);
    return Object.freeze({
      needDonorCode: asString(row.needDonorCode), donorName: asString(row.donorName), declaredBloodType: oneOf(row.declaredBloodType, BLOOD_TYPES),
      response: 'confirmada' as const, responseRecordedAt: asString(row.responseRecordedAt),
    });
  }
  const row = closedRecord(value, ['needDonorCode', 'validity', 'delivery', 'response']);
  return Object.freeze({
    needDonorCode: asString(row.needDonorCode), validity: oneOf(row.validity, VALIDITY), delivery: oneOf(row.delivery, DELIVERY),
    response: oneOf(row.response, ['sin_respuesta', 'rechazada'] as const),
  });
}

export const parseItem = (value: unknown): InvitationItem => {
  const row = closedRecord(value, [
    'invitationId', 'hospitalName', 'publicSiteName', 'requiredBloodType', 'urgency', 'instructions', 'expiresAt', 'validity', 'delivery', 'response',
  ]);
  return Object.freeze({
    invitationId: asString(row.invitationId), hospitalName: asString(row.hospitalName), publicSiteName: asString(row.publicSiteName),
    requiredBloodType: oneOf(row.requiredBloodType, BLOOD_TYPES), urgency: oneOf(row.urgency, URGENCIES), instructions: asString(row.instructions),
    expiresAt: asString(row.expiresAt), validity: oneOf(row.validity, VALIDITY), delivery: oneOf(row.delivery, DELIVERY), response: oneOf(row.response, RESPONSE),
  });
};

const batchOf = (reply: Record<string, unknown>): BatchResult => Object.freeze({
  batchId: asString(reply.batchId), createdInvitationCount: asNumber(reply.createdInvitationCount), queuedEmailCount: asNumber(reply.queuedEmailCount),
});

const parseResult = (reply: Record<string, unknown>): InvitationResponseResult =>
  Object.freeze({
    response: oneOf(reply.response, ['confirmada', 'rechazada'] as const), recordedAt: asString(reply.recordedAt), needStatus: oneOf(reply.needStatus, NEED_STATUSES),
  });

const parseHistory = (value: unknown): ResponseHistoryItem => {
  const row = closedRecord(value, ['invitationId', 'response', 'changedAt']);
  return Object.freeze({ invitationId: asString(row.invitationId), response: oneOf(row.response, ['confirmada', 'rechazada'] as const), changedAt: asString(row.changedAt) });
};

/** El cursor del historial es `{changedAt, id bigint}` en SQL; el cursor opaco común usa `{createdAt, id}`. */
function historyPage(reply: Record<string, unknown>) {
  const next = reply.next === null || reply.next === undefined ? null : closedRecord(reply.next, ['changedAt', 'id']);
  const page = pageOf({ items: reply.items, next: null }, parseHistory);
  return Object.freeze({ ...page, next: next === null ? null : Object.freeze({ createdAt: asString(next.changedAt), id: String(asNumber(next.id)) }) });
}

/**
 * Adaptador RPC de invitaciones. `rpc` llama con el JWT de la persona; `technical`, con la sesión técnica de la API (lote,
 * reintento y rutas de token). Nombres de función y argumentos `p_*` viven solo aquí.
 */
export function createInvitationsRpcGateway(rpc: RpcInvoker, technical: RpcInvoker): InvitationsRepository {
  const cursorArgs = (cursor: { createdAt: string; id: string } | null) => ({ p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null });
  const grantOf = (reply: Record<string, unknown>) => Object.freeze({ grantSecret: asString(reply.grantSecret) });

  return {
    async listBatches(accessToken, needId, { limit, cursor }) {
      const reply = await rpc({ accessToken, name: 'list_own_invitation_batches', okKinds: ['ok'], args: { p_need_id: needId, p_limit: limit, ...cursorArgs(cursor) } });
      return pageOf(reply, parseBatch);
    },

    async authorizeBatch(accessToken, { key, hash }, needId) {
      const reply = await rpc({ accessToken, name: 'authorize_invitation_batch', okKinds: ['ok', 'created'], args: { p_need_id: needId, p_key: key, p_hash: hash } });
      return reply.kind === 'created' ? Object.freeze({ replayed: batchOf(reply) }) : grantOf(reply);
    },

    async listNeedResponses(accessToken, needId, { limit, cursor }) {
      const reply = await rpc({ accessToken, name: 'list_own_need_responses', okKinds: ['ok'], args: { p_need_id: needId, p_limit: limit, ...cursorArgs(cursor) } });
      return Object.freeze({ ...pageOf(reply, parseNeedResponse), confirmedIntentCount: asNumber(reply.confirmedIntentCount) });
    },

    async listOwn(accessToken, { limit, cursor }) {
      return pageOf(await rpc({ accessToken, name: 'list_own_invitations', okKinds: ['ok'], args: { p_limit: limit, ...cursorArgs(cursor) } }), parseItem);
    },

    async getOwn(accessToken, invitationId): Promise<OwnInvitationDetail> {
      const reply = await rpc({ accessToken, name: 'get_own_invitation', okKinds: ['ok'], args: { p_invitation_id: invitationId } });
      return Object.freeze({ invitation: parseItem(reply.invitation), instructions: asString(reply.instructions) });
    },

    async changeResponse(accessToken, { key, hash }, invitationId, response) {
      return parseResult(await rpc({
        accessToken, name: 'change_own_invitation_response', okKinds: ['ok'],
        args: { p_key: key, p_hash: hash, p_invitation_id: invitationId, p_response: response },
      }));
    },

    async listHistory(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_own_response_history', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_changed_at: cursor?.createdAt ?? null, p_cursor_id: cursor === null ? null : Number(cursor.id) },
      });
      return historyPage(reply);
    },

    async authorizeRetry(accessToken, invitationId) {
      return grantOf(await rpc({ accessToken, name: 'authorize_invitation_retry', okKinds: ['ok'], args: { p_invitation_id: invitationId } }));
    },

    async requestBatch({ key, hash }, needId, grant, slots): Promise<BatchResult> {
      const reply = await technical({
        accessToken: null, name: 'request_invitation_batch', okKinds: ['created'],
        args: { p_key: key, p_hash: hash, p_need_id: needId, p_grant: grant.grantSecret, p_slots: slots },
      });
      return batchOf(reply);
    },

    async previewAction(tokenHash): Promise<ActionPreview> {
      const reply = await technical({ accessToken: null, name: 'get_invitation_action_preview', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      return Object.freeze({
        hospitalName: asString(reply.hospitalName), publicSiteName: asString(reply.publicSiteName),
        intendedAction: oneOf(reply.intendedAction, ['confirmar', 'rechazar'] as const), expiresAt: asString(reply.expiresAt),
      });
    },

    async respondByToken(tokenHash, { key, hash }) {
      return parseResult(await technical({
        accessToken: null, name: 'respond_invitation_by_token', okKinds: ['ok'], args: { p_token_hash: tokenHash, p_key: key, p_hash: hash },
      }));
    },

    async retryDelivery({ key, hash }, invitationId, grant, slot) {
      await technical({
        accessToken: null, name: 'retry_invitation_delivery', okKinds: ['accepted'],
        args: { p_key: key, p_hash: hash, p_invitation_id: invitationId, p_grant: grant.grantSecret, p_slot: slot },
      });
    },
  };
}
