import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SignUpResult } from '../../../shared/auth/session-ports.js';
import { deriveHmacKeyring } from '../../../shared/crypto/hmac.js';
import { hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import { createDonorRecordsService } from './donor-records-service.js';
import type { ActivationPreview, DonorRecordsRepository, OwnProfileView } from './donor-records.ports.js';

const TOKEN = 'T'.repeat(43);
const OUTBOX = '70000000-0000-4000-8000-000000000001';
const PAIR = { accessToken: 'at-nuevo', refreshToken: 'rt-nuevo', expiresIn: 600 } as const;
const PROFILE: OwnProfileView = {
  name: 'Ana', email: 'ana@example.test', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: { latitude: -12.046, longitude: -77.043 },
};
const PREVIEW: ActivationPreview = { hospitalName: 'Hospital Demo Uno', expiresAt: '2026-10-14T00:00:00Z', email: 'alta@example.test', orphanUserId: null };
const LIMA = { latitude: -12.046, longitude: -77.043 };

type Options = {
  signUp?: SignUpResult; signUps?: SignUpResult[]; preview?: ActivationPreview; linkError?: Error; deleteInert?: boolean;
  allowed?: (bucket: string) => boolean; updateEmailError?: Error; issueError?: Error; recipientError?: Error; reissueVerificationError?: Error; failRevokeAt?: number[]; openError?: boolean;
  passwordSetupRequired?: boolean; verifiedEmail?: string;
};

function harness(options: Options = {}) {
  const calls: string[] = [];
  const seen = {
    sealed: [] as Array<[string, Record<string, unknown>]>, buckets: [] as Array<[string, number, number]>, hashes: [] as string[],
    envelopes: [] as Array<{ key: string; hash: string }>, links: [] as Array<Record<string, unknown>>, signUps: [] as Array<[string, string]>,
  };
  const sleeps: number[] = [];
  let signUpCalls = 0;
  let revokes = 0;
  const repository = {
    linkDonorAccount: async (link) => { calls.push('link'); seen.links.push(link); if (options.linkError) throw options.linkError; },
    donorVerificationPreview: async (hash) => { seen.hashes.push(hash); return { expiresAt: '2026-10-14T00:00:00Z' }; },
    verifyDonorEmail: async (hash) => {
      seen.hashes.push(hash);
      return {
        outcome: { status: 'reclamada_incompleta', emailVerified: true }, userId: 'u-nuevo', email: options.verifiedEmail ?? 'ana@example.test',
        passwordSetupRequired: options.passwordSetupRequired ?? true,
      };
    },
    issuePasswordSetup: async (userId, issue) => { calls.push(`passwordSetup:${userId}`); seen.links.push(issue); },
    confirmPasswordSetup: async () => undefined,
    assistedActivationPreview: async (hash) => { calls.push('preview'); seen.hashes.push(hash); return options.preview ?? PREVIEW; },
    assistedSignupRecipient: async (signupId, hospitalId) => { calls.push(`recipient:${signupId}:${hospitalId}`); if (options.recipientError) throw options.recipientError; return 'alta@example.test'; },
    linkAssistedAccount: async (userId, hash) => { calls.push(`linkAssisted:${userId}`); seen.hashes.push(hash); if (options.linkError) throw options.linkError; return { status: 'reclamada_incompleta', emailVerified: true }; },
    emailChangePreview: async () => ({ expiresAt: '2026-10-14T00:00:00Z' }),
    consumeEmailChange: async () => ({ userId: 'u-donante', sealedEmail: 'sellado' }),
    reissueDonorVerification: async (command) => { calls.push('reissueVerification'); seen.links.push(command); if (options.reissueVerificationError) throw options.reissueVerificationError; },
    createAssistedSignup: async (_token, envelope, command) => {
      calls.push('createSignup');
      seen.envelopes.push(envelope);
      seen.links.push(command);
      return { signup: { signupId: 's1', status: 'pendiente', createdAt: 'a', activationExpiresAt: 'b', purgeAt: 'c' }, seq: 1 };
    },
    issueAssistedActivation: async (signupId, hospitalId, seq, issue) => {
      calls.push(`issue:${signupId}:${hospitalId}:${seq}`);
      seen.links.push(issue);
      if (options.issueError) throw options.issueError;
    },
    listAssistedSignups: async () => ({ items: [], next: null }),
    getAssistedSignup: async () => ({ signupId: 's1', status: 'pendiente', createdAt: 'a', activationExpiresAt: 'b', purgeAt: 'c' }),
    reissueAssistedLink: async (_token, envelope, signupId) => { seen.envelopes.push(envelope); calls.push(`reissue:${signupId}`); return { seq: 2 }; },
    getProfile: async () => PROFILE,
    completeOnboarding: async (_token, envelope, input) => { seen.envelopes.push(envelope); seen.links.push(input); return PROFILE; },
    updateParticipation: async (_token, envelope, input) => { seen.envelopes.push(envelope); seen.links.push(input); return PROFILE; },
  } satisfies DonorRecordsRepository;
  const service = createDonorRecordsService({
    repository,
    sessions: {
      signUp: async (email, password) => {
        calls.push('signUp'); seen.signUps.push([email, password]);
        if (options.signUps) return options.signUps[signUpCalls++] ?? PAIR;
        return options.signUp === undefined ? PAIR : options.signUp;
      },
      signOut: async (_token, scope) => { calls.push(`signOut:${scope}`); },
      verifyAccessToken: async () => ({ userId: 'u-nuevo', sessionId: 's', aal: 'aal1', amr: [] }),
    },
    admin: {
      updatePassword: async () => undefined,
      updateEmail: async (id, email) => { calls.push(`updateEmail:${id}:${email}`); if (options.updateEmailError) throw options.updateEmailError; },
      deleteInertUser: async (id) => { calls.push(`deleteInert:${id}`); return options.deleteInert ?? true; },
      revokeAllSessions: async () => { calls.push('revokeAllSessions'); revokes += 1; if (options.failRevokeAt?.includes(revokes)) throw new Error('canario-auth'); },
    },
    limiter: { consume: async (bucket, _subject, limit, window) => { seen.buckets.push([bucket, limit, window]); return { allowed: options.allowed?.(bucket) ?? true, retryAfterSeconds: 33 }; } },
    keys: deriveHmacKeyring('integration-email-hmac-sintetico-02'),
    seal: (outboxId, payload) => { seen.sealed.push([outboxId, payload]); return 'v1.k1.cifrado'; },
    open: (context, sealed) => {
      if (options.openError) throw new Error('no se abre');
      seen.hashes.push(context);
      return sealed === 'sellado' ? ' Nuevo@Example.Test ' : 'basura';
    },
    newToken: () => TOKEN, newId: () => OUTBOX, now: () => 1_000, sleep: async (ms) => { sleeps.push(ms); },
  });
  return { service, calls, seen, sleeps };
}

describe('registerDonor', () => {
  it('crea la cuenta, la vincula con el hash del token y descarta la sesión que devuelve Auth', async () => {
    const { service, calls, seen } = harness();

    await service.registerDonor(' Ana@Example.Test ', 'contrasena-larga-1', 'clave-registro-0001', 'ip-hmac');

    expect(seen.signUps).toEqual([['ana@example.test', 'contrasena-larga-1']]);
    expect(calls).toEqual(['signUp', 'link', 'signOut:local']);
    const link = seen.links[0];
    expect(link.tokenHash).toBe(hashToken(TOKEN));
    expect(link.userId).toBe('u-nuevo');
    expect(link.sealed).toBe('v1.k1.cifrado');
    expect(JSON.stringify(link)).not.toContain(TOKEN);
    expect(JSON.stringify(link)).not.toContain('ana@example.test');
    expect(seen.sealed).toEqual([[OUTBOX, { recipient: 'ana@example.test', token: TOKEN }]]);
  });

  it('si el correo ya tiene cuenta responde igual y solo pide a la base reenviar la verificación (que decide si procede)', async () => {
    const { service, calls, seen } = harness({ signUp: 'exists' });

    await expect(service.registerDonor('ana@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip')).resolves.toBeUndefined();

    expect(calls).toEqual(['signUp', 'reissueVerification']);
    expect(seen.links[0]).toMatchObject({ email: 'ana@example.test', tokenHash: hashToken(TOKEN) });
  });

  it('iguala el tiempo de ambos caminos con un piso', async () => {
    const created = harness();
    const exists = harness({ signUp: 'exists' });

    await created.service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip');
    await exists.service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip');

    expect(created.sleeps).toEqual(exists.sleeps);
    expect(created.sleeps[0]).toBeGreaterThan(0);
  });

  it('aplica límites por IP y por correo antes de tocar Auth', async () => {
    const { service, calls, seen } = harness({ allowed: (bucket) => bucket !== 'register:email' });

    await expect(service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip')).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    expect(calls).toEqual([]);
    expect(seen.buckets.map(([bucket]) => bucket)).toEqual(['register:ip', 'register:email']);
  });

  it('si el vínculo falla elimina la cuenta recién creada, cierra la sesión y propaga el error', async () => {
    const { service, calls } = harness({ linkError: new ApiError('STATE_CONFLICT') });

    await expect(service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip')).rejects.toMatchObject({ code: 'STATE_CONFLICT' });

    expect(calls).toEqual(['signUp', 'link', 'deleteInert:u-nuevo', 'signOut:local']);
  });

  it('si la base rechaza la reemisión de la verificación (misma clave con otro correo) el error se propaga y no se elimina nada', async () => {
    const { service, calls } = harness({ signUp: 'exists', reissueVerificationError: new ApiError('STATE_CONFLICT') });

    await expect(service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip')).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(calls.some((call) => call.startsWith('deleteInert'))).toBe(false);
  });

  it('si Auth no devuelve sesión es 503 y no se vincula nada', async () => {
    const { service, calls } = harness({ signUp: null });

    await expect(service.registerDonor('a@example.test', 'contrasena-larga-1', 'clave-registro-0001', 'ip')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    expect(calls).toEqual(['signUp']);
  });
});

describe('verificación de correo', () => {
  it('la vista previa y el consumo usan solo el hash del token', async () => {
    const { service, seen } = harness();

    expect(await service.previewEmailVerification(TOKEN)).toEqual({ action: 'verificar_email', expiresAt: '2026-10-14T00:00:00Z' });
    expect(await service.verifyEmail(TOKEN, 'ip')).toEqual({ status: 'reclamada_incompleta', emailVerified: true });

    expect(seen.hashes).toEqual([hashToken(TOKEN), hashToken(TOKEN)]);
  });

  it('el consumo tiene límite por IP', async () => {
    const { service } = harness({ allowed: () => false });

    await expect(service.verifyEmail(TOKEN, 'ip')).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 33 });
  });
});

describe('verificación de un autorregistro: contraseña pendiente', () => {
  it('cierra las sesiones anteriores y envía el enlace de recuperación al correo verificado, en ese orden', async () => {
    const { service, calls, seen } = harness();

    await service.verifyEmail(TOKEN, 'ip');

    expect(calls).toEqual(['revokeAllSessions', 'passwordSetup:u-nuevo']);
    expect(seen.sealed).toEqual([[OUTBOX, { recipient: 'ana@example.test', token: TOKEN }]]);
    expect(seen.links[0]).toEqual({ tokenHash: hashToken(TOKEN), outboxId: OUTBOX, sealed: 'v1.k1.cifrado' });
    expect(JSON.stringify(seen.links)).not.toContain(TOKEN);
  });

  it('no toca sesiones ni envía nada si la contraseña no está pendiente (correo ya verificado antes)', async () => {
    const { service, calls } = harness({ passwordSetupRequired: false });

    await service.verifyEmail(TOKEN, 'ip');

    expect(calls).toEqual([]);
  });

  it('si no consigue cerrar las sesiones (dos intentos) responde 503 y no envía el enlace', async () => {
    const { service, calls } = harness({ failRevokeAt: [1, 2] });

    await expect(service.verifyEmail(TOKEN, 'ip')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls).toEqual(['revokeAllSessions', 'revokeAllSessions']);
  });

  it('sin correo en la respuesta de la base no hace nada y responde 503', async () => {
    const { service, calls } = harness({ verifiedEmail: '' });

    await expect(service.verifyEmail(TOKEN, 'ip')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls).toEqual([]);
  });
});

describe('claimAssisted', () => {
  it('crea la cuenta con la contraseña de la persona, la vincula y devuelve la sesión', async () => {
    const { service, calls, seen } = harness();

    const { tokens, outcome } = await service.claimAssisted(TOKEN, 'contrasena-larga-1', 'ip');

    expect(tokens).toEqual(PAIR);
    expect(outcome).toEqual({ status: 'reclamada_incompleta', emailVerified: true });
    expect(seen.signUps).toEqual([['alta@example.test', 'contrasena-larga-1']]);
    expect(calls).toEqual(['preview', 'signUp', 'linkAssisted:u-nuevo']);
  });

  it('si el vínculo falla elimina la cuenta recién creada y cierra su sesión', async () => {
    const { service, calls } = harness({ linkError: new ApiError('ACTION_UNAVAILABLE') });

    await expect(service.claimAssisted(TOKEN, 'contrasena-larga-1', 'ip')).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });

    expect(calls).toEqual(['preview', 'signUp', 'linkAssisted:u-nuevo', 'deleteInert:u-nuevo', 'signOut:local']);
  });

  it('un usuario inerte de Auth que ocupa el correo se reemplaza y se repite el registro', async () => {
    const { service, calls } = harness({ preview: { ...PREVIEW, orphanUserId: 'u-huerfano' }, signUps: ['exists', PAIR] });

    await service.claimAssisted(TOKEN, 'contrasena-larga-1', 'ip');

    expect(calls).toEqual(['preview', 'signUp', 'deleteInert:u-huerfano', 'signUp', 'linkAssisted:u-nuevo']);
  });

  it('si el borrado atómico del huérfano no procede es 409 y no se repite el registro', async () => {
    const { service, calls } = harness({ preview: { ...PREVIEW, orphanUserId: 'u-huerfano' }, signUp: 'exists', deleteInert: false });

    await expect(service.claimAssisted(TOKEN, 'contrasena-larga-1', 'ip')).rejects.toMatchObject({ code: 'STATE_CONFLICT' });

    expect(calls).toEqual(['preview', 'signUp', 'deleteInert:u-huerfano']);
  });

  it('un correo ocupado por una cuenta con vida propia (sin huérfano) es 409 y nunca se elimina', async () => {
    const { service, calls } = harness({ signUp: 'exists' });

    await expect(service.claimAssisted(TOKEN, 'contrasena-larga-1', 'ip')).rejects.toMatchObject({ code: 'STATE_CONFLICT' });

    expect(calls.some((call) => call.startsWith('deleteInert'))).toBe(false);
  });

  it('la vista previa expone el hospital y no el correo', async () => {
    const { service } = harness();

    expect(await service.previewAssistedActivation(TOKEN)).toEqual({ action: 'reclamar_alta', expiresAt: PREVIEW.expiresAt, hospitalName: 'Hospital Demo Uno' });
  });
});

describe('verifyEmailChange', () => {
  it('abre el correo con el hash del token, lo actualiza y cierra todas las sesiones', async () => {
    const { service, calls, seen } = harness();

    await service.verifyEmailChange(TOKEN, 'ip');

    expect(seen.hashes).toEqual([hashToken(TOKEN)]);
    expect(calls).toEqual(['updateEmail:u-donante:nuevo@example.test', 'revokeAllSessions']);
  });

  it('un correo ya ocupado es 409', async () => {
    const { service } = harness({ updateEmailError: new PersistenceError('rejected') });

    await expect(service.verifyEmailChange(TOKEN, 'ip')).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('si no se puede abrir el correo sellado es un error interno genérico', async () => {
    const { service, calls } = harness({ openError: true });

    await expect(service.verifyEmailChange(TOKEN, 'ip')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(calls).toEqual([]);
  });

  it('reintenta la revocación una vez y, si falla otra vez, responde 503', async () => {
    const retried = harness({ failRevokeAt: [1] });
    await expect(retried.service.verifyEmailChange(TOKEN, 'ip')).resolves.toBeUndefined();
    expect(retried.calls.filter((call) => call === 'revokeAllSessions')).toHaveLength(2);

    const failed = harness({ failRevokeAt: [1, 2] });
    await expect(failed.service.verifyEmailChange(TOKEN, 'ip')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

const HOSPITAL = { hospitalId: 'h-1', hospitalName: 'Hospital Demo Uno' } as const;

describe('altas asistidas del hospital', () => {
  it('registra el alta con la sesión del admin y emite el token con la sesión técnica, sellando el correo y el hospital', async () => {
    const { service, calls, seen } = harness();

    await service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: ' Nueva@Example.Test ', name: '  Persona  ' });

    expect(calls).toEqual(['createSignup', 'issue:s1:h-1:1']);
    expect(seen.sealed).toEqual([[OUTBOX, { recipient: 'nueva@example.test', token: TOKEN, hospitalName: 'Hospital Demo Uno' }]]);
    expect(seen.links[0]).toEqual({ email: 'nueva@example.test', name: 'Persona' });
    expect(seen.links[1]).toMatchObject({ tokenHash: hashToken(TOKEN), outboxId: OUTBOX });
    expect(JSON.stringify(seen.envelopes)).not.toContain('nueva@example.test');
  });

  it('el admin no pasa el hash del token: el comando del alta solo lleva correo y nombre', async () => {
    const { service, seen } = harness();

    await service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test' });

    expect(Object.keys(seen.links[0])).toEqual(['email', 'name']);
  });

  it('el hash de la idempotencia distingue el nombre y sin nombre usa null', async () => {
    const withName = harness();
    const without = harness();

    await withName.service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test', name: 'Ana' });
    await without.service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test' });

    expect(withName.seen.envelopes[0].hash).not.toBe(without.seen.envelopes[0].hash);
    expect(without.seen.links[0].name).toBeNull();
  });

  it('un nombre vacío tras recortar es un valor inválido (422) y no llama a la base', async () => {
    const { service, calls } = harness();

    await expect(service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test', name: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(calls).toEqual([]);
  });

  it('si al emitir el enlace el alta ya cambió (409) se devuelve igual; otros errores se propagan', async () => {
    const conflict = harness({ issueError: new ApiError('STATE_CONFLICT') });
    const limited = harness({ issueError: new ApiError('RATE_LIMITED') });

    await expect(conflict.service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test' })).resolves.toMatchObject({ signupId: 's1' });
    await expect(limited.service.createAssistedSignup('jwt', HOSPITAL, 'clave-alta-0000001', { email: 'a@example.test' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('la reemisión sube la emisión con la sesión del admin y emite con el correo que la sesión técnica obtiene del hospital de la sesión', async () => {
    const { service, calls, seen } = harness();

    await service.reissueAssistedLink('jwt', HOSPITAL, 'clave-reemit-00001', 's1');

    expect(calls).toEqual(['reissue:s1', 'recipient:s1:h-1', 'issue:s1:h-1:2']);
    expect(seen.sealed).toEqual([[OUTBOX, { recipient: 'alta@example.test', token: TOKEN, hospitalName: 'Hospital Demo Uno' }]]);
  });

  it('un reintento de reemisión sobre un alta que ya se reclamó (409 al buscar el destinatario) responde igual', async () => {
    const { service, calls } = harness({ recipientError: new ApiError('STATE_CONFLICT') });

    await expect(service.reissueAssistedLink('jwt', HOSPITAL, 'clave-reemit-00001', 's1')).resolves.toBeUndefined();

    expect(calls).toEqual(['reissue:s1', 'recipient:s1:h-1']);
  });
});

describe('perfil propio', () => {
  it('rechaza una ubicación fuera del polígono, fuera de rango o con más de tres decimales antes de llamar a la base', async () => {
    const { service, seen } = harness();
    const input = { name: 'Ana', declaredBloodType: 'O_POS', isAvailable: true };

    for (const approximateLocation of [{ latitude: 40.416, longitude: -3.703 }, { latitude: -12.0461, longitude: -77.043 }, { latitude: 95, longitude: -77.043 }]) {
      await expect(service.completeOnboarding('jwt', 'clave-onboard-0001', { ...input, approximateLocation })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(service.updateParticipation('jwt', 'clave-partic-0001', { approximateLocation })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(seen.envelopes).toEqual([]);
  });

  it('pasa la versión del polígono con la que se validó y recorta el nombre', async () => {
    const { service, seen } = harness();

    await service.completeOnboarding('jwt', 'clave-onboard-0001', { name: ' Ana ', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA });

    expect(seen.links[0]).toMatchObject({ name: 'Ana', polygonVersion: 'DEMO_ONLY-1', approximateLocation: LIMA });
  });

  it('el hash del onboarding sigue el orden y los valores que la RPC recalcula en SQL', async () => {
    const { service, seen } = harness();

    await service.completeOnboarding('jwt', 'clave-onboard-0001', { name: 'Ana', declaredBloodType: 'A_POS', isAvailable: true, approximateLocation: LIMA });

    expect(seen.envelopes[0].hash).toBe(createHash('sha256')
      .update('{"name":"Ana","declaredBloodType":"A_POS","isAvailable":true,"latitude":-12.046,"longitude":-77.043}', 'utf8').digest('hex'));
  });

  it('la participación sin ubicación no envía versión de polígono y usa null en el hash', async () => {
    const { service, seen } = harness();

    await service.updateParticipation('jwt', 'clave-partic-0001', { isAvailable: false });
    await service.updateParticipation('jwt', 'clave-partic-0002', { approximateLocation: LIMA });

    expect(seen.links[0]).toMatchObject({ isAvailable: false, polygonVersion: undefined });
    expect(seen.links[1]).toMatchObject({ approximateLocation: LIMA, polygonVersion: 'DEMO_ONLY-1' });
    expect(seen.envelopes[0].hash).not.toBe(seen.envelopes[1].hash);
  });
});
