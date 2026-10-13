import { describe, expect, it } from 'vitest';
import { PersistenceError } from './errors.js';
import { mapFailureToApiError, parseRpcReply } from './rpc-reply.js';

describe('parseRpcReply', () => {
  it('acepta un objeto plano con un kind propio de la operación o un fallo común', () => {
    expect(parseRpcReply({ kind: 'created', need: {} }, ['created'])).toEqual({ kind: 'created', need: {} });
    expect(parseRpcReply({ kind: 'forbidden' }, ['created'])).toEqual({ kind: 'forbidden' });
  });

  it('rechaza valores que no son objetos planos o kinds fuera de la allowlist', () => {
    for (const bad of [null, undefined, 'created', 7, [], { kind: 7 }, { kind: 'otro' }, {}, Object.create({ kind: 'created' })]) {
      expect(() => parseRpcReply(bad, ['created'])).toThrow(PersistenceError);
    }
  });
});

describe('mapFailureToApiError', () => {
  it('traduce cada fallo al error público del catálogo', () => {
    const table: Array<[string, string, number]> = [
      ['unauthenticated', 'AUTHENTICATION_REQUIRED', 401],
      ['forbidden', 'ACCESS_DENIED', 403],
      ['mfa_required', 'MFA_REQUIRED', 403],
      ['step_up_required', 'STEP_UP_REQUIRED', 403],
      ['not_found', 'RESOURCE_NOT_FOUND', 404],
      ['conflict', 'STATE_CONFLICT', 409],
      ['payload_conflict', 'STATE_CONFLICT', 409],
      ['in_progress', 'STATE_CONFLICT', 409],
      ['gone', 'ACTION_UNAVAILABLE', 410],
      ['invalid', 'VALIDATION_FAILED', 422],
      ['rate_limited', 'RATE_LIMITED', 429],
    ];
    for (const [kind, code] of table) expect(mapFailureToApiError(kind).code).toBe(code);
  });

  it('cualquier otro fallo, incluidos nombres heredados del prototipo, es INTERNAL_ERROR', () => {
    expect(mapFailureToApiError('site_unusable').code).toBe('INTERNAL_ERROR');
    expect(mapFailureToApiError('constructor').code).toBe('INTERNAL_ERROR');
  });
});
