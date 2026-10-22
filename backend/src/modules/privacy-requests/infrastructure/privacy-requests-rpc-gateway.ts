import { asArray, asNumber, asString, closedRecord, oneOf } from '../../../shared/persistence/guards.js';
import { pageOf } from '../../../shared/persistence/page.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import {
  REQUEST_STATUSES, type ContextualData, type CorrectionRequestView, type GrantField, type GrantView, type PrivacyPurgeRepository,
  type PrivacyRequestsRepository, type PurgeReport, type RequestedField,
} from '../application/privacy-requests.ports.js';

const FIELDS = ['name', 'email', 'declaredBloodType', 'deletion'] as const satisfies readonly RequestedField[];
const GRANT_FIELDS = ['name', 'email', 'declaredBloodType'] as const satisfies readonly GrantField[];
const TYPES = ['correccion', 'eliminacion'] as const;
const ACTIONS = ['review', 'execute'] as const;

export function parseRequest(value: unknown): CorrectionRequestView {
  const row = closedRecord(value, ['requestId', 'type', 'requestedFields', 'status', 'createdAt', 'updatedAt'], ['decisionReason']);
  return Object.freeze({
    requestId: asString(row.requestId), type: oneOf(row.type, TYPES),
    requestedFields: Object.freeze(asArray(row.requestedFields).map((field) => oneOf(field, FIELDS))),
    status: oneOf(row.status, REQUEST_STATUSES), createdAt: asString(row.createdAt), updatedAt: asString(row.updatedAt),
    ...(row.decisionReason === undefined ? {} : { decisionReason: asString(row.decisionReason) }),
  });
}

function parseGrant(value: unknown): GrantView {
  const row = closedRecord(value, ['grantId', 'requestId', 'action', 'allowedFields', 'expiresAt']);
  return Object.freeze({
    grantId: asString(row.grantId), requestId: asString(row.requestId), action: oneOf(row.action, ACTIONS),
    allowedFields: Object.freeze(asArray(row.allowedFields).map((field) => oneOf(field, GRANT_FIELDS))), expiresAt: asString(row.expiresAt),
  });
}

function parseValues(value: unknown): Readonly<Partial<Record<GrantField, string>>> {
  const row = closedRecord(value, [], GRANT_FIELDS);
  const out: Partial<Record<GrantField, string>> = {};
  for (const field of GRANT_FIELDS) if (row[field] !== undefined && row[field] !== null) out[field] = asString(row[field]);
  return Object.freeze(out);
}

function parsePurge(reply: Record<string, unknown>): PurgeReport {
  const row = closedRecord(reply, ['kind', 'purged', 'failedRequests', 'pendingDeletions']);
  const purged = closedRecord(row.purged, ['idempotencyRecords', 'actionTokens', 'rateLimitEvents', 'accessGrants', 'assistedSignups']);
  return Object.freeze({
    purged: Object.freeze(Object.fromEntries(Object.entries(purged).map(([key, count]) => [key, asNumber(count)]))),
    failedRequests: asNumber(row.failedRequests),
    pendingDeletions: Object.freeze(asArray(row.pendingDeletions).map((item) => {
      const pending = closedRecord(item, ['requestId', 'donorId']);
      return Object.freeze({ requestId: asString(pending.requestId), donorId: asString(pending.donorId) });
    })),
  });
}

/**
 * Adaptador RPC de solicitudes de privacidad. `rpc` llama con el JWT de la persona; `technical`, con la sesión técnica de la
 * API (cierre de una ejecución). Nombres de función y argumentos `p_*` viven solo aquí.
 */
export function createPrivacyRequestsRpcGateway(rpc: RpcInvoker, technical: RpcInvoker): PrivacyRequestsRepository {
  return {
    async createOwn(accessToken, { key, hash }, input) {
      const reply = await rpc({
        accessToken, name: 'create_own_correction_request', okKinds: ['created'],
        args: {
          p_key: key, p_hash: hash, p_request_id: input.requestId, p_type: input.type, p_name: input.name,
          p_email_sealed: input.emailSealed, p_blood_type: input.declaredBloodType,
        },
      });
      return parseRequest(reply.request);
    },

    async listOwn(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_own_correction_requests', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseRequest);
    },

    async getOwn(accessToken, requestId) {
      return parseRequest((await rpc({ accessToken, name: 'get_own_correction_request', okKinds: ['ok'], args: { p_id: requestId } })).request);
    },

    async list(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_correction_requests', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseRequest);
    },

    async get(accessToken, requestId) {
      return parseRequest((await rpc({ accessToken, name: 'get_correction_request', okKinds: ['ok'], args: { p_id: requestId } })).request);
    },

    async decide(accessToken, { key, hash }, requestId, decision, reason) {
      const reply = await rpc({
        accessToken, name: 'decide_correction_request', okKinds: ['ok'],
        args: { p_key: key, p_hash: hash, p_id: requestId, p_decision: decision, p_reason: reason },
      });
      return parseRequest(reply.request);
    },

    async createGrant(accessToken, { key, hash }, grant) {
      const reply = await rpc({
        accessToken, name: 'create_contextual_access_grant', okKinds: ['created'],
        args: { p_key: key, p_hash: hash, p_request_id: grant.requestId, p_action: grant.action, p_allowed_fields: [...grant.allowedFields], p_reason: grant.reason },
      });
      return parseGrant(reply.grant);
    },

    async contextualData(accessToken, requestId, grantId) {
      const reply = await rpc({
        accessToken, name: 'get_contextual_donor_data', okKinds: ['ok'], args: { p_request_id: requestId, p_grant_id: grantId },
      });
      const row = closedRecord(reply, ['kind', 'currentValues', 'proposedValues'], ['proposedEmailSealed']);
      const data: ContextualData = {
        currentValues: parseValues(row.currentValues), proposedValues: parseValues(row.proposedValues),
        ...(row.proposedEmailSealed === undefined || row.proposedEmailSealed === null ? {} : { proposedEmailSealed: asString(row.proposedEmailSealed) }),
      };
      return Object.freeze(data);
    },

    async execute(accessToken, { key, hash }, requestId, grantId) {
      const reply = await rpc({
        accessToken, name: 'execute_correction_request', okKinds: ['ok'],
        args: { p_key: key, p_hash: hash, p_request_id: requestId, p_grant_id: grantId },
      });
      const row = closedRecord(reply, ['kind', 'next', 'request']);
      return Object.freeze({ request: parseRequest(row.request), next: oneOf(row.next, ['none', 'email', 'deletion'] as const) });
    },

    async executionSubject(requestId) {
      const reply = await technical({ accessToken: null, name: 'get_execution_subject', okKinds: ['ok'], args: { p_request_id: requestId } });
      const row = closedRecord(reply, ['kind', 'type'], ['donorId', 'proposedEmailSealed']);
      return Object.freeze({
        type: oneOf(row.type, TYPES),
        ...(row.donorId === undefined ? {} : { donorId: asString(row.donorId) }),
        ...(row.proposedEmailSealed === undefined ? {} : { proposedEmailSealed: asString(row.proposedEmailSealed) }),
      });
    },

    async issueEmailChange(requestId, issue) {
      await technical({
        accessToken: null, name: 'issue_email_change', okKinds: ['ok'],
        args: { p_request_id: requestId, p_token_hash: issue.tokenHash, p_sealed_email: issue.sealedEmail, p_outbox_id: issue.outboxId, p_sealed_payload: issue.sealedPayload },
      });
    },

    async finishDeletion(requestId, subjectHmac) {
      await technical({ accessToken: null, name: 'finish_deletion', okKinds: ['ok'], args: { p_request_id: requestId, p_subject_hmac: subjectHmac } });
    },

    async failExecution(requestId) {
      await technical({ accessToken: null, name: 'fail_correction_request', okKinds: ['ok'], args: { p_request_id: requestId } });
    },
  };
}

/** Adaptador del worker: la sesión del worker ejecuta las purgas y recupera las eliminaciones a medias. */
export function createPrivacyPurgeRpcGateway(worker: RpcInvoker): PrivacyPurgeRepository {
  return {
    async purge() {
      return parsePurge(await worker({ accessToken: null, name: 'worker_purge_expired', okKinds: ['ok'], args: {} }));
    },
    async purgeAuthAccounts(limit) {
      const row = closedRecord(await worker({ accessToken: null, name: 'worker_purge_auth_accounts', okKinds: ['ok'], args: { p_limit: limit } }), ['kind', 'staleDeleted', 'inertDeleted']);
      return Object.freeze({ staleDeleted: asNumber(row.staleDeleted), inertDeleted: asNumber(row.inertDeleted) });
    },
    async finishDeletion(requestId, subjectHmac) {
      await worker({ accessToken: null, name: 'finish_deletion', okKinds: ['ok'], args: { p_request_id: requestId, p_subject_hmac: subjectHmac } });
    },
    async failExecution(requestId) {
      await worker({ accessToken: null, name: 'fail_correction_request', okKinds: ['ok'], args: { p_request_id: requestId } });
    },
  };
}
