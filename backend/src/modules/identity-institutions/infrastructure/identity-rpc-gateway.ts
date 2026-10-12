import type { ActorInfo, ActorResolver } from '../../../shared/auth/session-ports.js';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import { callRpc } from '../../../shared/persistence/rpc.js';
import { parseRpcReply } from '../../../shared/persistence/rpc-reply.js';
import type { SupabaseFactory } from '../../../shared/persistence/supabase-client.js';
import type { KeyOutcome, PublicIdempotency, RateLimiter, UserKeyGuard } from '../application/identity.ports.js';

const ROLES = new Set(['donante', 'admin_hospitalario', 'superadmin']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

/** Guard cerrado de `api.current_actor()`: cualquier forma inesperada es un error de persistencia. */
export function parseActor(value: unknown): ActorInfo | null {
  if (value === null) return null;
  if (!isRecord(value) || !hasOnly(value, ['role', 'displayName', 'hospital'])) throw new PersistenceError('shape');
  const { role, displayName, hospital } = value;
  if (typeof role !== 'string' || !ROLES.has(role) || typeof displayName !== 'string') throw new PersistenceError('shape');

  let parsedHospital: ActorInfo['hospital'] = null;
  if (hospital !== null) {
    if (!isRecord(hospital) || !hasOnly(hospital, ['hospitalId', 'hospitalName', 'membershipActive', 'hospitalAuthorized'])
      || typeof hospital.hospitalId !== 'string' || typeof hospital.hospitalName !== 'string'
      || typeof hospital.membershipActive !== 'boolean' || typeof hospital.hospitalAuthorized !== 'boolean') {
      throw new PersistenceError('shape');
    }
    parsedHospital = Object.freeze({
      hospitalId: hospital.hospitalId,
      hospitalName: hospital.hospitalName,
      membershipActive: hospital.membershipActive,
      hospitalAuthorized: hospital.hospitalAuthorized,
    });
  }
  return Object.freeze({ role: role as ActorInfo['role'], displayName, hospital: parsedHospital });
}

const KEY_KINDS = ['ok', 'conflict'] as const;

function outcomeOf(value: unknown): KeyOutcome {
  const reply = parseRpcReply(value, KEY_KINDS);
  switch (reply.kind) {
    case 'ok':
    case 'conflict':
    case 'payload_conflict':
    case 'in_progress':
    case 'invalid':
      return reply.kind;
    default:
      // unauthenticated, forbidden... no son esperables aquí: se tratan como fallo de persistencia.
      throw new PersistenceError('rejected');
  }
}

export function createIdentityGateways(factory: SupabaseFactory): Readonly<{
  actors: ActorResolver;
  limiter: RateLimiter;
  publicKeys: PublicIdempotency;
  userKeys: UserKeyGuard;
}> {
  return Object.freeze({
    actors: {
      async currentActor(accessToken) {
        return parseActor(await callRpc(factory.forUser(accessToken), 'current_actor', {}));
      },
    },
    limiter: {
      async consume(bucket, subject, limit, windowSeconds) {
        const value = await callRpc(factory.anonymous(), 'consume_rate_limit', {
          p_bucket: bucket, p_subject: subject, p_limit: limit, p_window: `${windowSeconds} seconds`,
        });
        if (!isRecord(value) || !hasOnly(value, ['allowed', 'retryAfterSeconds'])
          || typeof value.allowed !== 'boolean' || typeof value.retryAfterSeconds !== 'number') {
          throw new PersistenceError('shape');
        }
        return Object.freeze({ allowed: value.allowed, retryAfterSeconds: value.retryAfterSeconds });
      },
    },
    publicKeys: {
      async record(actorRef, operation, key, hash) {
        return outcomeOf(await callRpc(factory.anonymous(), 'record_public_idempotency', {
          p_actor_ref: actorRef, p_operation: operation, p_key: key, p_hash: hash,
        }));
      },
    },
    userKeys: {
      async consume(accessToken, operation, key, hash) {
        return outcomeOf(await callRpc(factory.forUser(accessToken), 'consume_idempotency_key', {
          p_operation: operation, p_key: key, p_hash: hash,
        }));
      },
    },
  });
}
