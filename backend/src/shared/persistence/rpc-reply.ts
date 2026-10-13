import { ApiError } from '../http/errors.js';
import { PersistenceError } from './errors.js';

/** Fallos comunes de toda RPC con efectos (ADR-003). */
export const COMMON_FAILURE_KINDS = Object.freeze([
  'unauthenticated', 'forbidden', 'mfa_required', 'step_up_required', 'not_found', 'conflict',
  'payload_conflict', 'in_progress', 'gone', 'invalid', 'rate_limited',
] as const);

export type RpcReply<K extends string = string> = Readonly<{ kind: K } & Record<string, unknown>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Valida que la respuesta de la RPC sea un objeto plano con un `kind` permitido
 * (los de la operación más los fallos comunes). Las claves de la proyección las
 * valida el guard cerrado de cada operación.
 */
export function parseRpcReply<K extends string>(value: unknown, allowedKinds: readonly K[]): RpcReply<K | (typeof COMMON_FAILURE_KINDS)[number]> {
  if (!isPlainObject(value) || typeof value.kind !== 'string') throw new PersistenceError('shape');
  const allowed: readonly string[] = [...allowedKinds, ...COMMON_FAILURE_KINDS];
  if (!allowed.includes(value.kind)) throw new PersistenceError('shape');
  return value as RpcReply<K | (typeof COMMON_FAILURE_KINDS)[number]>;
}

const FAILURE_TO_ERROR: Readonly<Record<string, ConstructorParameters<typeof ApiError>[0]>> = Object.freeze({
  unauthenticated: 'AUTHENTICATION_REQUIRED',
  forbidden: 'ACCESS_DENIED',
  mfa_required: 'MFA_REQUIRED',
  step_up_required: 'STEP_UP_REQUIRED',
  not_found: 'RESOURCE_NOT_FOUND',
  conflict: 'STATE_CONFLICT',
  payload_conflict: 'STATE_CONFLICT',
  in_progress: 'STATE_CONFLICT',
  gone: 'ACTION_UNAVAILABLE',
  invalid: 'VALIDATION_FAILED',
  rate_limited: 'RATE_LIMITED',
});

/** Traduce un `kind` de fallo; cualquier otro valor (incluidos fallos propios sin mapear) es un 500. */
export function mapFailureToApiError(kind: string): ApiError {
  return new ApiError(Object.hasOwn(FAILURE_TO_ERROR, kind) ? FAILURE_TO_ERROR[kind] : 'INTERNAL_ERROR');
}
