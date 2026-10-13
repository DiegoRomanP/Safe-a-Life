import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { parseIdempotencyKey } from '../../../shared/http/idempotency-key.js';
import { PersistenceUnavailableError } from '../../../shared/persistence/errors.js';
import { NeedDtoError, parseCreateNeedInput, parseCreatedNeedEnvelope } from '../dto/validators.js';
import { createNeedDraft, projectNeedDraft, type NeedDraftOwner, type NeedDraftProjection, type NormalizedNeedDraftInput } from '../domain/need-draft.js';
import type {
  AtomicNeedDraftCommand, AtomicNeedDraftGateway, CreateNeedDraftContext, CreateNeedDraftIdempotency, CreateNeedDraftResult,
  NeedDraftFailureCode,
} from './create-need-draft.ports.js';

export type CreateNeedDraft = (
  body: unknown,
  context: CreateNeedDraftContext,
  idempotency: CreateNeedDraftIdempotency,
) => Promise<CreateNeedDraftResult>;

const PLAIN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (code: NeedDraftFailureCode): CreateNeedDraftResult => Object.freeze({ ok: false, code });

/** Hash canónico de la intención ya normalizada (radio omitido = 10). `app.fingerprint` lo recalcula en SQL. */
export function fingerprintNeedDraftInput(input: NormalizedNeedDraftInput): string {
  return fingerprint([
    ['component', input.component],
    ['requiredBloodType', input.requiredBloodType],
    ['targetConfirmations', input.targetConfirmations],
    ['siteId', input.siteId],
    ['radiusKm', input.radiusKm],
    ['urgency', input.urgency],
    ['expiresInHours', input.expiresInHours],
  ]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

const FAILURE_KINDS: Readonly<Record<string, NeedDraftFailureCode>> = Object.freeze({
  unauthenticated: 'AUTHENTICATION_REQUIRED',
  forbidden: 'ACCESS_DENIED',
  site_unusable: 'VALIDATION_FAILED',
  payload_conflict: 'STATE_CONFLICT',
  in_progress: 'STATE_CONFLICT',
  rate_limited: 'RATE_LIMITED',
  failed: 'INTERNAL_ERROR',
});

/** Compara la necesidad devuelta con la intención pedida: una divergencia es una respuesta corrupta. */
function matchesIntent(need: NeedDraftProjection, input: NormalizedNeedDraftInput): boolean {
  return need.component === input.component
    && need.requiredBloodType === input.requiredBloodType
    && need.targetConfirmations === input.targetConfirmations
    // PostgreSQL devuelve el uuid en minúsculas aunque el cliente lo haya enviado en mayúsculas.
    && need.siteId.toLowerCase() === input.siteId.toLowerCase()
    && need.radiusKm === input.radiusKm
    && need.urgency === input.urgency;
}

/** Valida la respuesta desconocida del gateway y la convierte en resultado; lanza si está corrupta. */
function interpret(reply: unknown, input: NormalizedNeedDraftInput, expected: NeedDraftOwner): CreateNeedDraftResult {
  if (!isPlainObject(reply) || typeof reply.kind !== 'string') throw new TypeError('reply');
  const { kind } = reply;

  if (Object.hasOwn(FAILURE_KINDS, kind)) {
    if (!hasExactKeys(reply, ['kind'])) throw new TypeError('reply');
    return fail(FAILURE_KINDS[kind]);
  }
  if (kind !== 'created' && kind !== 'replayed') throw new TypeError('reply');
  if (!hasExactKeys(reply, ['kind', 'owner', 'need'])) throw new TypeError('reply');

  const { owner, need: rawNeed } = reply;
  if (!isPlainObject(owner) || !hasExactKeys(owner, ['actorId', 'hospitalId'])) throw new TypeError('reply');
  if (owner.actorId !== expected.actorId || owner.hospitalId !== expected.hospitalId) throw new TypeError('reply');

  // Valida con el DTO vigente ANTES de quitar campos: una fila con extras no se «limpia» para hacerla pasar.
  const need = parseCreatedNeedEnvelope({ data: rawNeed }).data as NeedDraftProjection;
  if (!matchesIntent(need, input)) throw new TypeError('reply');

  const draft = createNeedDraft(need, expected);
  return Object.freeze({ ok: true, outcome: kind, need: projectNeedDraft(draft) });
}

/**
 * Caso de uso «crear necesidad en borrador» (spec A2 §4). Recibe body, contexto y metadatos por
 * separado; no lee la petición HTTP. Una sola llamada al puerto atómico y sin reintentos: un fallo
 * incierto conserva la clave del llamador para reintentar. Solo la indisponibilidad de la persistencia
 * se propaga (el transporte la traduce a 503); cualquier otro fallo es un 500 genérico.
 */
export function createNeedDraftService(gateway: AtomicNeedDraftGateway): CreateNeedDraft {
  return async (body, context, idempotency) => {
    // Copia por campos antes del primer await: lo que cambie el llamador después no afecta al comando.
    const principal = context.principal;
    if (principal === null) return fail('AUTHENTICATION_REQUIRED');
    const { actorId, role, aal } = principal;
    const membership = principal.membership === null
      ? null
      : { hospitalId: principal.membership.hospitalId, isActive: principal.membership.isActive, hospitalIsActive: principal.membership.hospitalIsActive };
    const rawKey = idempotency.key;

    if (role !== 'admin_hospitalario' || aal !== 'aal2' || membership === null || !membership.isActive || !membership.hospitalIsActive) {
      return fail('ACCESS_DENIED');
    }
    const key = parseIdempotencyKey(rawKey);
    if (key === undefined) return fail('BAD_REQUEST');

    let input: NormalizedNeedDraftInput;
    try {
      const parsed = parseCreateNeedInput(body);
      // `format: uuid` también admite `urn:uuid:…`, que la base no acepta: se rechaza en el borde como forma inválida.
      if (!PLAIN_UUID.test(parsed.siteId)) return fail('BAD_REQUEST');
      input = Object.freeze({
        component: parsed.component,
        requiredBloodType: parsed.requiredBloodType,
        targetConfirmations: parsed.targetConfirmations,
        siteId: parsed.siteId,
        radiusKm: parsed.radiusKm,
        urgency: parsed.urgency,
        expiresInHours: parsed.expiresInHours,
      }) as NormalizedNeedDraftInput;
    } catch (error) {
      if (error instanceof NeedDtoError) return fail(error.category === 'shape' ? 'BAD_REQUEST' : error.category === 'rule' ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR');
      return fail('INTERNAL_ERROR');
    }

    const owner: NeedDraftOwner = Object.freeze({ actorId, hospitalId: membership.hospitalId });
    const command: AtomicNeedDraftCommand = Object.freeze({
      input,
      owner,
      idempotency: Object.freeze({ operation: 'createHospitalNeed' as const, key, payloadHash: fingerprintNeedDraftInput(input) }),
    });

    let reply: unknown;
    try {
      reply = await gateway.createDraft(command);
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) throw error;
      return fail('INTERNAL_ERROR');
    }

    try {
      return interpret(reply, input, owner);
    } catch {
      return fail('INTERNAL_ERROR');
    }
  };
}
