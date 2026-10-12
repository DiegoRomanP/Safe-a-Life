import { describe, expect, it } from 'vitest';
import type { Principal } from '../../../shared/auth/principal.js';
import type { ActorInfo, SessionGateway, TokenPair } from '../../../shared/auth/session-ports.js';
import { ApiError } from '../../../shared/http/errors.js';
import { createAuthService } from './auth-service.js';
import type { IdentityDependencies, KeyOutcome } from './identity.ports.js';

const TOKENS: TokenPair = { accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 600 };
const ELEVATED: TokenPair = { accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 600 };
const SECRET = 's'.repeat(40);
const META = { idempotencyKey: 'clave-de-prueba-0001', ipSubject: 'a'.repeat(64) };
const ADMIN: ActorInfo = { role: 'admin_hospitalario', displayName: 'Hospital Sintético', hospital: null };

function harness(options: {
  signIn?: TokenPair | null;
  actor?: ActorInfo | null;
  record?: KeyOutcome;
  consume?: KeyOutcome;
  allowed?: (bucket: string) => { allowed: boolean; retryAfterSeconds: number };
  factors?: Array<{ factorId: string; verified: boolean }>;
  verified?: TokenPair | null;
  floorMs?: number;
} = {}) {
  const calls: string[] = [];
  const recorded: Array<{ actorRef: string; hash: string }> = [];
  const slept: number[] = [];
  const sessions = {
    signIn: async () => { calls.push('signIn'); return options.signIn === undefined ? TOKENS : options.signIn; },
    signOut: async (_token: string, scope?: string) => { calls.push(`signOut:${scope ?? 'global'}`); },
    listTotpFactors: async () => options.factors ?? [{ factorId: 'f1', verified: true }],
    unenrollFactor: async () => undefined,
    enrollTotp: async () => ({ factorId: 'f2', otpauthUri: 'otpauth://totp/x?secret=ABC' }),
    challenge: async () => 'c1',
    verify: async () => options.verified === undefined ? ELEVATED : options.verified,
    challengeAndVerify: async () => options.verified === undefined ? ELEVATED : options.verified,
    verifyAccessToken: async () => ({ userId: 'u', sessionId: 's', aal: 'aal2' as const, amr: [{ method: 'totp', timestamp: 1_000_000 }] }),
    refresh: async () => null,
  } as unknown as SessionGateway;
  const deps: IdentityDependencies = {
    actors: { currentActor: async () => { calls.push('actor'); return options.actor === undefined ? ADMIN : options.actor; } },
    limiter: {
      consume: async (bucket) => {
        calls.push(`limit:${bucket}`);
        return options.allowed?.(bucket) ?? { allowed: true, retryAfterSeconds: 0 };
      },
    },
    publicKeys: { record: async (actorRef, _op, _key, hash) => { calls.push('record'); recorded.push({ actorRef, hash }); return options.record ?? 'ok'; } },
    userKeys: { consume: async () => { calls.push('consume'); return options.consume ?? 'ok'; } },
  };
  const service = createAuthService(sessions, deps, {
    emailHmacSecret: SECRET,
    loginFailureFloorMs: options.floorMs ?? 0,
    sleep: async (ms) => { slept.push(ms); },
  });
  return { service, calls, recorded, slept };
}

const principal = (overrides: Partial<Principal> = {}): Principal => ({
  userId: 'u1', sessionId: 's1', aal: 'aal1', amr: [], accessToken: 'at-1', role: 'admin_hospitalario',
  displayName: 'Hospital Sintético', hospital: null, ...overrides,
});

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try { await promise; return undefined; } catch (error) { return error instanceof ApiError ? error.code : 'OTRO'; }
}

describe('createSession', () => {
  it('limita por IP y por email ANTES de tocar Auth y responde 429 con la espera mayor', async () => {
    const { service, calls } = harness({ allowed: (bucket) => ({ allowed: bucket !== 'login:email', retryAfterSeconds: bucket === 'login:email' ? 90 : 0 }) });

    const error = await service.createSession({ email: 'a@example.test', password: 'x' }, META).catch((e) => e);

    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 90 });
    expect(calls).not.toContain('signIn');
  });

  it('credenciales inválidas y usuario sin cuenta de aplicación dan el mismo 401', async () => {
    const wrong = harness({ signIn: null });
    const noAccount = harness({ actor: null });

    expect(await codeOf(wrong.service.createSession({ email: 'a@example.test', password: 'x' }, META))).toBe('AUTHENTICATION_REQUIRED');
    expect(await codeOf(noAccount.service.createSession({ email: 'a@example.test', password: 'x' }, META))).toBe('AUTHENTICATION_REQUIRED');
    expect(noAccount.calls).toContain('signOut:local');
    expect(noAccount.calls).not.toContain('record');
  });

  it('cierra solo la sesión recién creada (scope local) si la clave de idempotencia falla', async () => {
    for (const outcome of ['payload_conflict', 'in_progress', 'conflict'] as const) {
      const { service, calls } = harness({ record: outcome });
      expect(await codeOf(service.createSession({ email: 'a@example.test', password: 'x' }, META))).toBe('STATE_CONFLICT');
      expect(calls).toContain('signOut:local');
      expect(calls).not.toContain('signOut:global');
    }
    const invalid = harness({ record: 'invalid' });
    expect(await codeOf(invalid.service.createSession({ email: 'a@example.test', password: 'x' }, META))).toBe('BAD_REQUEST');
  });

  it('el hash de idempotencia NO deriva de la contraseña ni usa el secreto crudo', async () => {
    const first = harness();
    const second = harness();

    await first.service.createSession({ email: 'A@Example.test ', password: 'contrasena-canario-1' }, META);
    await second.service.createSession({ email: 'a@example.test', password: 'otra-contrasena-canario-2' }, META);

    expect(first.recorded[0].hash).toBe(second.recorded[0].hash);
    expect(first.recorded[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(first.recorded)).not.toContain('canario');
    expect(first.recorded[0].actorRef).toMatch(/^email:[0-9a-f]{64}$/);
  });

  it('un admin con TOTP verificado recibe un reto; un donante no', async () => {
    const admin = await harness().service.createSession({ email: 'a@example.test', password: 'x' }, META);
    const donor = await harness({ actor: { role: 'donante', displayName: 'Donante', hospital: null } })
      .service.createSession({ email: 'd@example.test', password: 'x' }, META);

    expect(admin.view).toMatchObject({ mfaRequired: true, mfaChallengeId: 'c1', aal: 1 });
    expect(donor.view).toMatchObject({ mfaRequired: false, aal: 1 });
    expect(donor.view.mfaChallengeId).toBeUndefined();
  });

  it('iguala en tiempo solo los 401: espera hasta el piso configurado', async () => {
    const failing = harness({ signIn: null, floorMs: 400 });
    await codeOf(failing.service.createSession({ email: 'a@example.test', password: 'x' }, META));
    expect(failing.slept).toHaveLength(1);
    expect(failing.slept[0]).toBeGreaterThan(0);
    expect(failing.slept[0]).toBeLessThanOrEqual(400);

    const limited = harness({ floorMs: 400, allowed: () => ({ allowed: false, retryAfterSeconds: 5 }) });
    await codeOf(limited.service.createSession({ email: 'a@example.test', password: 'x' }, META));
    expect(limited.slept).toHaveLength(0);

    const success = harness({ floorMs: 400 });
    await success.service.createSession({ email: 'a@example.test', password: 'x' }, META);
    expect(success.slept).toHaveLength(0);
  });
});

describe('MFA y step-up', () => {
  it('verifyMfa: solo admin/superadmin, no repetible y con la clave de un solo uso', async () => {
    expect(await codeOf(harness().service.verifyMfa(principal({ role: 'donante' }), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001'))).toBe('ACCESS_DENIED');
    expect(await codeOf(harness().service.verifyMfa(principal({ aal: 'aal2' }), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001'))).toBe('STATE_CONFLICT');
    expect(await codeOf(harness({ consume: 'conflict' }).service.verifyMfa(principal(), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001'))).toBe('STATE_CONFLICT');
    expect(await codeOf(harness({ verified: null }).service.verifyMfa(principal(), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001'))).toBe('AUTHENTICATION_REQUIRED');

    const ok = await harness().service.verifyMfa(principal(), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001');
    expect(ok.tokens).toEqual(ELEVATED);
    expect(ok.view).toMatchObject({ aal: 2, mfaRequired: false });
  });

  it('el límite de MFA por usuario se evalúa antes de consumir la clave', async () => {
    const { service, calls } = harness({ allowed: () => ({ allowed: false, retryAfterSeconds: 30 }) });

    expect(await codeOf(service.verifyMfa(principal(), TOKENS, { challengeId: 'c', code: '123456' }, 'clave-de-prueba-0001'))).toBe('RATE_LIMITED');
    expect(calls).not.toContain('consume');
  });

  it('verifyStepUp exige AAL2 y devuelve hasta cuándo vale (300 s desde el TOTP)', async () => {
    expect(await codeOf(harness().service.verifyStepUp(principal({ aal: 'aal1' }), TOKENS, { code: '123456' }, 'clave-de-prueba-0001'))).toBe('MFA_REQUIRED');

    const result = await harness().service.verifyStepUp(principal({ aal: 'aal2' }), TOKENS, { code: '123456' }, 'clave-de-prueba-0001');
    expect(result.verifiedUntil).toBe(new Date((1_000_000 + 300) * 1000).toISOString());
  });

  it('enrollMfa: no repite si ya hay un factor verificado y no entra a donantes', async () => {
    expect(await codeOf(harness().service.enrollMfa(principal({ role: 'donante' }), TOKENS, 'clave-de-prueba-0001'))).toBe('ACCESS_DENIED');
    expect(await codeOf(harness().service.enrollMfa(principal(), TOKENS, 'clave-de-prueba-0001'))).toBe('STATE_CONFLICT');

    const enrolled = await harness({ factors: [] }).service.enrollMfa(principal(), TOKENS, 'clave-de-prueba-0001');
    expect(enrolled).toMatchObject({ factorId: 'f2', challengeId: 'c1' });
  });

  it('signOut revoca con alcance global', async () => {
    const { service, calls } = harness();
    await service.signOut('at-1');
    expect(calls).toEqual(['signOut:global']);
  });
});
