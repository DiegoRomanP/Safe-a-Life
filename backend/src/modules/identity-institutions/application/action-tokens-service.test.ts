import { describe, expect, it } from 'vitest';
import { deriveHmacKeyring } from '../../../shared/crypto/hmac.js';
import { hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { SignUpResult, TokenPair } from '../../../shared/auth/session-ports.js';
import type { ActionTokensRepository, AdminInvitationPreview } from './action-tokens.ports.js';
import { createActionTokensService } from './action-tokens-service.js';

const TOKEN = 'tok_canario_abcdefghijklmnop0123456789ABCDE';
const HOSPITAL = '11111111-1111-4111-8111-111111111101';
const OUTBOX = '70000000-0000-4000-8000-000000000001';
const PAIR: TokenPair = { accessToken: 'at-nuevo', refreshToken: 'rt-nuevo', expiresIn: 600 };
const PREVIEW: AdminInvitationPreview = { hospitalName: 'Hospital Demo Uno', expiresAt: '2026-10-16T12:00:00.000000Z', email: 'invitado@example.test', orphanUserId: null };

function harness(options: {
  signUp?: SignUpResult; preview?: AdminInvitationPreview | Error; linkError?: Error; allowed?: (bucket: string) => boolean;
  hospitalError?: Error; updateError?: Error; consumeError?: Error; signUps?: SignUpResult[]; failRevokeAt?: number[]; deleteInert?: boolean; hookError?: Error;
  closeResults?: Array<'ok' | 'conflict' | Error>;
} = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const seen = { invite: [] as unknown[], recovery: [] as unknown[], sealed: [] as unknown[], signUp: [] as unknown[], buckets: [] as Array<[string, number, number]> };
  let revokes = 0;
  let signUpCalls = 0;
  let closes = 0;
  const repository: ActionTokensRepository = {
    inviteAdmin: async (...args) => { calls.push('inviteAdmin'); seen.invite.push(args); },
    adminInvitationPreview: async () => { calls.push('preview'); if (options.preview instanceof Error) throw options.preview; return options.preview ?? PREVIEW; },
    linkAdminAccount: async () => { calls.push('link'); if (options.linkError) throw options.linkError; return { hospitalName: 'Hospital Demo Uno' }; },
    requestRecovery: async (command) => { calls.push('requestRecovery'); seen.recovery.push(command); },
    consumePasswordReset: async () => { calls.push('consume'); if (options.consumeError) throw options.consumeError; return { userId: 'u-1', generation: 3 }; },
    closeSessionBarrier: async (userId, generation) => {
      calls.push(`closeBarrier:${userId}:${generation}`);
      const next = options.closeResults?.[closes++] ?? 'ok';
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const service = createActionTokensService({
    repository,
    sessions: {
      signUp: async (email, password) => {
        calls.push('signUp'); seen.signUp.push([email, password]);
        if (options.signUps) return options.signUps[signUpCalls++] ?? PAIR;
        return options.signUp === undefined ? PAIR : options.signUp;
      },
      signOut: async (_token, scope) => { calls.push(`signOut:${scope}`); },
      verifyAccessToken: async () => ({ userId: 'u-nuevo', sessionId: 's', aal: 'aal1', amr: [] }),
    },
    admin: {
      updatePassword: async () => { calls.push('updatePassword'); if (options.updateError) throw options.updateError; },
      updateEmail: async () => undefined,
      deleteInertUser: async (id) => { calls.push(`deleteUser:${id}`); return options.deleteInert ?? true; },
      deleteAccount: async () => undefined,
      revokeAllSessions: async () => { calls.push('revokeAllSessions'); revokes += 1; if (options.failRevokeAt?.includes(revokes)) throw new Error('canario-auth'); },
    },
    limiter: { consume: async (bucket, _subject, limit, window) => { seen.buckets.push([bucket, limit, window]); return { allowed: options.allowed?.(bucket) ?? true, retryAfterSeconds: 33 }; } },
    keys: deriveHmacKeyring('integration-email-hmac-sintetico-02'),
    seal: (outboxId, payload) => { seen.sealed.push([outboxId, payload]); return 'v1.k1.cifrado'; },
    hospitalName: async () => { if (options.hospitalError) throw options.hospitalError; return 'Hospital Demo Uno'; },
    onPasswordChanged: async (userId) => { calls.push(`passwordChanged:${userId}`); if (options.hookError) throw options.hookError; },
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

  it('un usuario inerte de Auth que ocupa el correo se reemplaza: se elimina y se repite el registro', async () => {
    const { service, calls } = harness({ preview: { ...PREVIEW, orphanUserId: 'u-huerfano' }, signUps: ['exists', PAIR] });

    const { view } = await claim(service);

    expect(calls).toEqual(['preview', 'signUp', 'deleteUser:u-huerfano', 'signUp', 'link']);
    expect(view.mfaRequired).toBe(true);
  });

  it('si el borrado atómico del huérfano no procede (la cuenta ya tiene vida propia) es 409 y no se repite el registro', async () => {
    const { service, calls } = harness({ preview: { ...PREVIEW, orphanUserId: 'u-huerfano' }, signUp: 'exists', deleteInert: false });

    await expect(claim(service)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(calls).toEqual(['preview', 'signUp', 'deleteUser:u-huerfano']);
  });

  it('si tras reemplazar al huérfano el correo sigue ocupado, es 409', async () => {
    const { service } = harness({ preview: { ...PREVIEW, orphanUserId: 'u-huerfano' }, signUps: ['exists', 'exists'] });

    await expect(claim(service)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('un correo ocupado por una cuenta con vida propia (sin huérfano) nunca se elimina', async () => {
    const { service, calls } = harness({ signUp: 'exists' });

    await expect(claim(service)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(calls.some((call) => call.startsWith('deleteUser'))).toBe(false);
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
    expect(existing.calls).toEqual(['requestRecovery']);
    const [command] = existing.seen.recovery as Array<Record<string, string>>;
    expect(command).toMatchObject({ email: 'existe@example.test', tokenHash: hashToken(TOKEN), outboxId: OUTBOX, sealed: 'v1.k1.cifrado', key: 'clave-de-prueba-0001' });
    expect(command.actorRef).toMatch(/^email:[0-9a-f]{64}$/);
    expect(command.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(existing.seen.recovery)).not.toContain(TOKEN);
  });

  it('el hash de idempotencia depende del correo normalizado: la misma clave con otro correo no coincide', async () => {
    const a = harness();
    const b = harness();

    await request(a.service, 'uno@example.test');
    await request(b.service, 'otro@example.test');

    const [first] = a.seen.recovery as Array<{ hash: string; actorRef: string }>;
    const [second] = b.seen.recovery as Array<{ hash: string; actorRef: string }>;
    expect(first.hash).not.toBe(second.hash);
    expect(first.actorRef).not.toBe(second.actorRef);
  });

  it('iguala el tiempo con un piso de 150 ms', async () => {
    const { service, sleeps } = harness();

    await request(service);

    expect(sleeps).toEqual([150]);
  });

  it('aplica 10 por IP cada 15 min y 3 por correo (HMAC) por hora, y responde 429 sin llamar a la RPC', async () => {
    const limited = harness({ allowed: (bucket) => bucket !== 'recovery:email' });

    await expect(request(limited.service)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 33 });
    expect(limited.seen.buckets).toEqual([['recovery:ip', 10, 900], ['recovery:email', 3, 3600]]);
    expect(limited.calls).toEqual([]);
  });
});

describe('completePasswordReset', () => {
  it('consume el token, revoca las sesiones ANTES de cambiar la contraseña y revoca otra vez después', async () => {
    const { service, calls } = harness();

    await service.completePasswordReset(TOKEN, 'otra-contrasena-larga');

    expect(calls).toEqual(['consume', 'revokeAllSessions', 'updatePassword', 'passwordChanged:u-1', 'revokeAllSessions', 'closeBarrier:u-1:3']);
  });

  it('si el gancho que levanta el bloqueo falla, cierra igualmente las sesiones y responde 503', async () => {
    const { service, calls } = harness({ hookError: new Error('canario-base') });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    expect(calls).toEqual(['consume', 'revokeAllSessions', 'updatePassword', 'passwordChanged:u-1', 'revokeAllSessions']);
  });

  it('un token inválido no toca Auth', async () => {
    const { service, calls } = harness({ consumeError: new ApiError('ACTION_UNAVAILABLE') });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
    expect(calls).toEqual(['consume']);
  });

  it('si Auth rechaza la contraseña las sesiones ya estaban revocadas y el error se propaga', async () => {
    const { service, calls } = harness({ updateError: new ApiError('VALIDATION_FAILED') });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(calls).toEqual(['consume', 'revokeAllSessions', 'updatePassword']);
  });

  it('si la primera revocación falla no se cambia la contraseña (falla cerrado)', async () => {
    const { service, calls } = harness({ failRevokeAt: [1] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toThrow();
    expect(calls).toEqual(['consume', 'revokeAllSessions']);
  });

  it('un fallo de la segunda revocación se reintenta una vez y, si el reintento funciona, el reset termina', async () => {
    const { service, calls } = harness({ failRevokeAt: [2] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).resolves.toBeUndefined();

    expect(calls).toEqual(['consume', 'revokeAllSessions', 'updatePassword', 'passwordChanged:u-1', 'revokeAllSessions', 'revokeAllSessions', 'closeBarrier:u-1:3']);
  });

  it('si la segunda revocación falla también al reintentar no se responde éxito en silencio (503)', async () => {
    const { service, calls } = harness({ failRevokeAt: [2, 3] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    expect(calls).toEqual(['consume', 'revokeAllSessions', 'updatePassword', 'passwordChanged:u-1', 'revokeAllSessions', 'revokeAllSessions']);
  });

  it('si el gancho o la revocación final fallan NO se cierra la barrera (queda abierta: falla cerrado)', async () => {
    const hook = harness({ hookError: new Error('canario-base') });
    await expect(hook.service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const revoke = harness({ failRevokeAt: [2, 3] });
    await expect(revoke.service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    expect(hook.calls.some((call) => call.startsWith('closeBarrier'))).toBe(false);
    expect(revoke.calls.some((call) => call.startsWith('closeBarrier'))).toBe(false);
  });

  it('un fallo del cierre se reintenta una vez; si el reintento funciona el reset termina', async () => {
    const { service, calls } = harness({ closeResults: [new Error('canario-base'), 'ok'] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).resolves.toBeUndefined();
    expect(calls.filter((call) => call.startsWith('closeBarrier'))).toEqual(['closeBarrier:u-1:3', 'closeBarrier:u-1:3']);
  });

  it('si el cierre falla dos veces responde 503', async () => {
    const { service, calls } = harness({ closeResults: [new Error('canario-base'), new Error('canario-base')] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls.filter((call) => call.startsWith('closeBarrier'))).toHaveLength(2);
  });

  it('conflict (un reset posterior ya abrió otra generación) cuenta como éxito de esta operación, sin reintentar', async () => {
    const { service, calls } = harness({ closeResults: ['conflict'] });

    await expect(service.completePasswordReset(TOKEN, 'otra-contrasena-larga')).resolves.toBeUndefined();
    expect(calls.filter((call) => call.startsWith('closeBarrier'))).toHaveLength(1);
  });
});
