import { describe, expect, it } from 'vitest';
import { deriveHmacKeyring } from '../../../shared/crypto/hmac.js';
import { hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { SignUpResult, TokenPair } from '../../../shared/auth/session-ports.js';
import type { ActionTokensRepository, AdminInvitationPreview } from './action-tokens.ports.js';
import { createActionTokensService } from './action-tokens-service.js';
import type { KeyOutcome } from './identity.ports.js';

const TOKEN = 'tok_canario_abcdefghijklmnop0123456789ABCDE';
const HOSPITAL = '11111111-1111-4111-8111-111111111101';
const OUTBOX = '70000000-0000-4000-8000-000000000001';
const PAIR: TokenPair = { accessToken: 'at-nuevo', refreshToken: 'rt-nuevo', expiresIn: 600 };
const PREVIEW: AdminInvitationPreview = { hospitalName: 'Hospital Demo Uno', expiresAt: '2026-10-16T12:00:00.000000Z', email: 'invitado@example.test' };

function harness(options: {
  signUp?: SignUpResult; preview?: AdminInvitationPreview | Error; linkError?: Error; allowed?: (bucket: string) => boolean;
  keyOutcome?: KeyOutcome; hospitalError?: Error; updateError?: Error; consumeError?: Error;
} = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const seen = { invite: [] as unknown[], recovery: [] as unknown[], sealed: [] as unknown[], signUp: [] as unknown[], buckets: [] as string[] };
  const repository: ActionTokensRepository = {
    inviteAdmin: async (...args) => { calls.push('inviteAdmin'); seen.invite.push(args); },
    adminInvitationPreview: async () => { calls.push('preview'); if (options.preview instanceof Error) throw options.preview; return options.preview ?? PREVIEW; },
    linkAdminAccount: async () => { calls.push('link'); if (options.linkError) throw options.linkError; return { hospitalName: 'Hospital Demo Uno' }; },
    requestRecovery: async (command) => { calls.push('requestRecovery'); seen.recovery.push(command); },
    consumePasswordReset: async () => { calls.push('consume'); if (options.consumeError) throw options.consumeError; return { userId: 'u-1' }; },
  };
  const service = createActionTokensService({
    repository,
    sessions: {
      signUp: async (email, password) => { calls.push('signUp'); seen.signUp.push([email, password]); return options.signUp === undefined ? PAIR : options.signUp; },
      signOut: async (_token, scope) => { calls.push(`signOut:${scope}`); },
      verifyAccessToken: async () => ({ userId: 'u-nuevo', sessionId: 's', aal: 'aal1', amr: [] }),
    },
    admin: {
      updatePassword: async () => { calls.push('updatePassword'); if (options.updateError) throw options.updateError; },
      updateEmail: async () => undefined,
      deleteUser: async (id) => { calls.push(`deleteUser:${id}`); },
      revokeAllSessions: async () => { calls.push('revokeAllSessions'); },
    },
    limiter: { consume: async (bucket) => { seen.buckets.push(bucket); return { allowed: options.allowed?.(bucket) ?? true, retryAfterSeconds: 33 }; } },
    publicKeys: { record: async () => { calls.push('record'); return options.keyOutcome ?? 'ok'; } },
    keys: deriveHmacKeyring('integration-email-hmac-sintetico-02'),
    seal: (outboxId, payload) => { seen.sealed.push([outboxId, payload]); return 'v1.k1.cifrado'; },
    hospitalName: async () => { if (options.hospitalError) throw options.hospitalError; return 'Hospital Demo Uno'; },
    newToken: () => TOKEN, newId: () => OUTBOX, now: () => 1_000, sleep: async (ms) => { sleeps.push(ms); },
  });
  return { service, calls, seen, sleeps };
}

describe('inviteAdmin', () => {
  it('guarda solo el hash del token, sella el correo y el token y no los pasa en claro al repositorio', async () => {
    const { service, seen } = harness();

    await service.inviteAdmin('jwt', 'clave-de-prueba-0001', { email: ' Nuevo@Example.test ', hospitalId: HOSPITAL.toUpperCase() });

    const [, envelope, command] = seen.invite[0] as [string, { key: string; hash: string }, Record<string, string>];
    expect(command).toEqual({ email: 'nuevo@example.test', hospitalId: HOSPITAL, tokenHash: hashToken(TOKEN), outboxId: OUTBOX, sealed: 'v1.k1.cifrado' });
    expect(envelope.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(seen.invite)).not.toContain(TOKEN);
    expect(seen.sealed).toEqual([[OUTBOX, { recipient: 'nuevo@example.test', token: TOKEN, hospitalName: 'Hospital Demo Uno' }]]);
  });

  it('un hospital inexistente es VALIDATION_FAILED (el contrato no declara 404) y no encola nada', async () => {
    const { service, calls } = harness({ hospitalError: new ApiError('RESOURCE_NOT_FOUND') });

    await expect(service.inviteAdmin('jwt', 'clave-de-prueba-0001', { email: 'a@example.test', hospitalId: HOSPITAL })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(calls).not.toContain('inviteAdmin');
  });

  it('otros errores al buscar el hospital se propagan', async () => {
    const { service } = harness({ hospitalError: new ApiError('SERVICE_UNAVAILABLE') });

    await expect(service.inviteAdmin('jwt', 'clave-de-prueba-0001', { email: 'a@example.test', hospitalId: HOSPITAL })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('claimAdminInvitation', () => {
  const claim = (service: ReturnType<typeof harness>['service']) => service.claimAdminInvitation(TOKEN, 'contrasena-larga-segura', 'clave-de-prueba-0001', 'ip-hmac');

  it('comprueba la invitación ANTES de crear la cuenta; un token desconocido o vencido no llega a Auth', async () => {
    for (const code of ['RESOURCE_NOT_FOUND', 'ACTION_UNAVAILABLE'] as const) {
      const { service, calls } = harness({ preview: new ApiError(code) });

      await expect(claim(service)).rejects.toMatchObject({ code });
      expect(calls).toEqual(['preview']);
    }
  });

  it('crea la cuenta con el correo de la invitación, la vincula y devuelve una sesión AAL1 que exige MFA', async () => {
    const { service, calls, seen } = harness();

    const { tokens, view } = await claim(service);

    expect(seen.signUp).toEqual([['invitado@example.test', 'contrasena-larga-segura']]);
    expect(calls).toEqual(['preview', 'signUp', 'link']);
    expect(tokens).toBe(PAIR);
    expect(view).toEqual({ actor: { role: 'admin_hospitalario', displayName: 'Hospital Demo Uno', hospitalName: 'Hospital Demo Uno' }, aal: 1, mfaRequired: true });
  });

  it('si el correo ya tiene cuenta de Auth es 409 y no intenta vincular', async () => {
    const { service, calls } = harness({ signUp: 'exists' });

    await expect(claim(service)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(calls).toEqual(['preview', 'signUp']);
  });

  it('si Auth no devuelve sesión es 503', async () => {
    const { service } = harness({ signUp: null });

    await expect(claim(service)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('si el vínculo falla elimina la cuenta recién creada y cierra su sesión, y propaga el error', async () => {
    const { service, calls } = harness({ linkError: new ApiError('ACTION_UNAVAILABLE') });

    await expect(claim(service)).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
    expect(calls).toEqual(['preview', 'signUp', 'link', 'deleteUser:u-nuevo', 'signOut:local']);
  });

  it('el límite por IP responde 429 con Retry-After antes de tocar nada', async () => {
    const { service, calls } = harness({ allowed: () => false });

    await expect(claim(service)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 33 });
    expect(calls).toEqual([]);
  });
});

describe('requestPasswordRecovery', () => {
  const request = (service: ReturnType<typeof harness>['service'], email = 'Cualquiera@Example.test') => service.requestPasswordRecovery(email, 'clave-de-prueba-0001', 'ip-hmac');

  it('siempre llama a la misma RPC con el mismo formato (no distingue si la cuenta existe) y sella el token', async () => {
    const existing = harness();
    const missing = harness();

    await request(existing.service, 'existe@example.test');
    await request(missing.service, 'no-existe@example.test');

    expect(existing.calls).toEqual(missing.calls);
    expect(existing.calls).toEqual(['record', 'requestRecovery']);
    expect(existing.seen.recovery[0]).toEqual({ email: 'existe@example.test', tokenHash: hashToken(TOKEN), outboxId: OUTBOX, sealed: 'v1.k1.cifrado' });
    expect(JSON.stringify(existing.seen.recovery)).not.toContain(TOKEN);
  });

  it('iguala el tiempo con un piso de 150 ms', async () => {
    const { service, sleeps } = harness();

    await request(service);

    expect(sleeps).toEqual([150]);
  });

  it('aplica límites por IP y por correo (HMAC) y responde 429 sin llamar a la RPC', async () => {
    const limited = harness({ allowed: (bucket) => bucket !== 'recovery:email' });

    await expect(request(limited.service)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 33 });
    expect(limited.seen.buckets).toEqual(['recovery:ip', 'recovery:email']);
    expect(limited.calls).toEqual([]);
  });

  it('la misma clave con otra intención es 409', async () => {
    const { service, calls } = harness({ keyOutcome: 'payload_conflict' });

    await expect(request(service)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(calls).toEqual(['record']);
  });
});

describe('completePasswordReset', () => {
  it('consume el token, cambia la contraseña y revoca las sesiones, en ese orden', async () => {
    const { service, calls } = harness();

    await service.completePasswordReset(TOKEN, 'otra-contrasena-larga');

    expect(calls).toEqual(['consume', 'updatePassword', 'revokeAllSessions']);
  });

  it('un token inválido no toca Auth', async () => {
    const { service, calls } = harness({ consumeError: new ApiError('ACTION_UNAVAILABLE') });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
    expect(calls).toEqual(['consume']);
  });

  it('si Auth rechaza la contraseña no se revocan las sesiones y el error se propaga', async () => {
    const { service, calls } = harness({ updateError: new ApiError('VALIDATION_FAILED') });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(calls).toEqual(['consume', 'updatePassword']);
  });
});
