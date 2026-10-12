import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import { isStepUpFresh, requireAal2, requireActiveMembership, requireRole, requireSession, requireStepUp } from './guards.js';
import type { Principal } from './principal.js';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'u1', sessionId: 's1', aal: 'aal2', amr: [], accessToken: 't', role: 'superadmin', displayName: 'Super', hospital: null,
    ...overrides,
  };
}

function run(handler: (req: never, res: Response, next: (error?: unknown) => void) => void, value?: Principal): unknown {
  let result: unknown = 'sin-llamar';
  handler({} as never, { locals: value ? { principal: value } : {} } as unknown as Response, (error) => {
    result = error;
  });
  return result;
}

const codeOf = (error: unknown): string | undefined => (error instanceof ApiError ? error.code : undefined);

describe('guards', () => {
  it('requireSession responde 401 sin principal', () => {
    expect(codeOf(run(requireSession, undefined))).toBe('AUTHENTICATION_REQUIRED');
    expect(run(requireSession, principal())).toBeUndefined();
  });

  it('requireRole deniega roles ajenos con 403', () => {
    expect(run(requireRole('superadmin'), principal())).toBeUndefined();
    expect(codeOf(run(requireRole('admin_hospitalario'), principal()))).toBe('ACCESS_DENIED');
    expect(codeOf(run(requireRole('superadmin'), undefined))).toBe('AUTHENTICATION_REQUIRED');
  });

  it('requireAal2 exige MFA_REQUIRED con aal1', () => {
    expect(run(requireAal2, principal({ aal: 'aal2' }))).toBeUndefined();
    expect(codeOf(run(requireAal2, principal({ aal: 'aal1' })))).toBe('MFA_REQUIRED');
  });

  it('requireStepUp exige un TOTP dentro de los últimos 300 s', () => {
    const now = 1_000_000_000;
    const fresh = principal({ amr: [{ method: 'totp', timestamp: now - 299 }] });
    const stale = principal({ amr: [{ method: 'totp', timestamp: now - 301 }] });
    const password = principal({ amr: [{ method: 'password', timestamp: now }] });
    const guard = requireStepUp(300, () => now * 1000);

    expect(run(guard, fresh)).toBeUndefined();
    expect(codeOf(run(guard, stale))).toBe('STEP_UP_REQUIRED');
    expect(codeOf(run(guard, password))).toBe('STEP_UP_REQUIRED');
    expect(isStepUpFresh(fresh, now, 300)).toBe(true);
    expect(isStepUpFresh(principal(), now, 300)).toBe(false);
  });

  it('requireActiveMembership exige membresía activa y hospital autorizado', () => {
    const hospital = { hospitalId: 'h1', hospitalName: 'H', membershipActive: true, hospitalAuthorized: true };

    expect(run(requireActiveMembership, principal({ hospital }))).toBeUndefined();
    for (const bad of [null, { ...hospital, membershipActive: false }, { ...hospital, hospitalAuthorized: false }]) {
      expect(codeOf(run(requireActiveMembership, principal({ hospital: bad })))).toBe('ACCESS_DENIED');
    }
  });
});
