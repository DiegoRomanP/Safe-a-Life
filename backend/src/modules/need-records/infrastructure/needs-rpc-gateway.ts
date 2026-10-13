import { PersistenceError } from '../../../shared/persistence/errors.js';
import { asNumber, asString, closedRecord, oneOf } from '../../../shared/persistence/guards.js';
import { pageOf } from '../../../shared/persistence/page.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type { AtomicNeedDraftCommand, AtomicNeedDraftGateway } from '../application/create-need-draft.ports.js';
import type { NeedView, NeedsRepository } from '../application/needs.ports.js';
import { NEED_STATUSES } from '../domain/need-state.js';

const BLOOD_TYPES = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'] as const;
const URGENCIES = ['Normal', 'Urgente', 'Critica'] as const;

export function parseNeed(value: unknown): NeedView {
  const row = closedRecord(value, [
    'needId', 'component', 'requiredBloodType', 'targetConfirmations', 'confirmedIntentCount',
    'siteId', 'radiusKm', 'urgency', 'status', 'expiresAt',
  ]);
  return Object.freeze({
    needId: asString(row.needId),
    component: oneOf(row.component, ['RBC'] as const),
    requiredBloodType: oneOf(row.requiredBloodType, BLOOD_TYPES),
    targetConfirmations: asNumber(row.targetConfirmations),
    confirmedIntentCount: asNumber(row.confirmedIntentCount),
    siteId: asString(row.siteId),
    radiusKm: asNumber(row.radiusKm),
    urgency: oneOf(row.urgency, URGENCIES),
    status: oneOf(row.status, NEED_STATUSES),
    expiresAt: asString(row.expiresAt),
  });
}

/** Llamada a una RPC sin interpretar su respuesta (la creación interpreta los `kind` en el servicio). */
export type RawRpc = (accessToken: string, name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Fallos de la RPC que el servicio trata como 500 (el hash lo calcula este backend: un `invalid` es un defecto). */
const AS_FAILED = new Set(['invalid', 'conflict', 'not_found', 'gone', 'step_up_required']);
const PASSTHROUGH = new Set(['unauthenticated', 'forbidden', 'site_unusable', 'payload_conflict', 'in_progress', 'rate_limited']);

/**
 * Traduce la respuesta de `create_need_draft` al protocolo `AtomicNeedDraftReply`. Un replay se desenvuelve
 * a `replayed` con la respuesta original; `mfa_required` equivale a `forbidden` (ambos son 403). Cualquier
 * `kind` desconocido es una respuesta corrupta.
 */
export function toDraftReply(raw: unknown): unknown {
  if (!isPlainObject(raw) || typeof raw.kind !== 'string') throw new PersistenceError('shape');
  const { kind } = raw;
  if (kind === 'created') return raw;
  if (kind === 'replayed') {
    const stored = raw.response;
    if (!isPlainObject(stored) || stored.kind !== 'created') throw new PersistenceError('shape');
    return { kind: 'replayed', owner: stored.owner, need: stored.need };
  }
  if (kind === 'mfa_required') return { kind: 'forbidden' };
  if (PASSTHROUGH.has(kind)) return { kind };
  if (AS_FAILED.has(kind)) return { kind: 'failed' };
  throw new PersistenceError('shape');
}

/**
 * Adaptador RPC de necesidades: nombres de función SQL, argumentos `p_*` y guards cerrados viven solo
 * aquí. La creación es request-scoped al JWT del actor (nunca un cliente global ni `service_role`).
 */
export function createNeedsRpcGateway({ rpc, raw }: Readonly<{ rpc: RpcInvoker; raw: RawRpc }>) {
  const repository: NeedsRepository = {
    async list(accessToken, { limit, cursor, status }) {
      const reply = await rpc({
        accessToken, name: 'list_own_needs', okKinds: ['ok'],
        args: { p_limit: limit, p_status: status, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseNeed);
    },

    async get(accessToken, needId) {
      const reply = await rpc({ accessToken, name: 'get_own_need', okKinds: ['ok'], args: { p_id: needId } });
      return parseNeed(reply.need);
    },

    async transition(accessToken, { key, hash }, needId, status) {
      const reply = await rpc({
        accessToken, name: 'transition_own_need', okKinds: ['ok'],
        args: { p_key: key, p_hash: hash, p_id: needId, p_status: status },
      });
      return parseNeed(reply.need);
    },
  };

  const draftGatewayFor = (accessToken: string): AtomicNeedDraftGateway => ({
    async createDraft({ input, idempotency }: AtomicNeedDraftCommand) {
      return toDraftReply(await raw(accessToken, 'create_need_draft', {
        p_key: idempotency.key,
        p_hash: idempotency.payloadHash,
        p_component: input.component,
        p_required_blood_type: input.requiredBloodType,
        p_target: input.targetConfirmations,
        p_site_id: input.siteId,
        p_radius_km: input.radiusKm,
        p_urgency: input.urgency,
        p_expires_in_hours: input.expiresInHours,
      }));
    },
  });

  return Object.freeze({ repository, draftGatewayFor });
}
