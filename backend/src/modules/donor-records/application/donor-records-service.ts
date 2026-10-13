import { randomUUID } from 'node:crypto';
import type { SessionGateway, TokenPair } from '../../../shared/auth/session-ports.js';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { hmacEmailSubject, hmacSha256Hex, type HmacKeyring } from '../../../shared/crypto/hmac.js';
import { generateActionToken, hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { AuthAdmin } from '../../identity-institutions/application/auth-admin.ports.js';
import type { SealEmail } from '../../identity-institutions/application/action-tokens-service.js';
import type { RateLimiter } from '../../identity-institutions/application/identity.ports.js';
import { validateApproximateLocation, type ApproximateLocation } from '../domain/location.js';
import type {
  AssistedSignupView, DonorRecordsRepository, OnboardingOutcome, OwnProfileView, Page, PageQuery,
} from './donor-records.ports.js';

const IP_LIMIT = 10;
const IP_WINDOW_SECONDS = 15 * 60;
/** Por correo: 3 registros por hora (cada uno que prospera envía un correo a ese buzón). */
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_SECONDS = 60 * 60;
/** Iguala el tiempo de «ya existía» con el de «creada»: el registro de Auth domina y es más lento que el piso de recuperación. */
const REGISTRATION_FLOOR_MS = 700;
/** Un usuario de Auth más joven que esto puede ser el registro en curso de la propia persona: no se reemplaza. */
const ORPHAN_MIN_AGE_SECONDS = 60;

export type ActionPreview = Readonly<{ action: 'verificar_email' | 'reclamar_alta' | 'cambiar_email'; expiresAt: string; hospitalName?: string }>;
export type ClaimResult = Readonly<{ tokens: TokenPair; outcome: OnboardingOutcome }>;

export interface DonorRecordsServiceDependencies {
  readonly repository: DonorRecordsRepository;
  readonly sessions: Pick<SessionGateway, 'signUp' | 'signOut' | 'verifyAccessToken'>;
  readonly admin: AuthAdmin;
  readonly limiter: RateLimiter;
  readonly keys: Pick<HmacKeyring, 'email' | 'idempotency'>;
  readonly seal: SealEmail;
  /** Abre el correo nuevo sellado de un cambio de correo; el contexto es el hash del token. Lanza si no se puede abrir. */
  readonly open: (context: string, sealed: string) => string;
  readonly newToken?: () => string;
  readonly newId?: () => string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Nombre sin espacios sobrantes; vacío tras recortar no es un nombre. */
function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ApiError('VALIDATION_FAILED');
  return trimmed;
}

/** Una ubicación fuera del rango, con más de tres decimales o fuera del polígono versionado es un valor inválido (422). */
function checkedLocation(location: ApproximateLocation): string {
  const verdict = validateApproximateLocation(location);
  if (!verdict.ok) throw new ApiError('VALIDATION_FAILED');
  return verdict.polygonVersion;
}

/**
 * Casos de uso de donantes y altas asistidas (F5). Los tokens en claro nacen aquí y viajan solo dentro del correo
 * cifrado; la base guarda su hash. Las RPC con hash de token o id de usuario las ejecuta la sesión técnica del backend.
 * El hospital y el rol salen siempre de la sesión y de las tablas protegidas, nunca de la petición.
 */
export function createDonorRecordsService({
  repository, sessions, admin, limiter, keys, seal, open,
  newToken = generateActionToken, newId = randomUUID, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: DonorRecordsServiceDependencies) {
  const rejectIfLimited = async (checks: ReadonlyArray<readonly [string, string, number, number]>): Promise<void> => {
    const waits: number[] = [];
    for (const [bucket, subject, limit, windowSeconds] of checks) {
      const decision = await limiter.consume(bucket, subject, limit, windowSeconds);
      if (!decision.allowed) waits.push(decision.retryAfterSeconds);
    }
    if (waits.length > 0) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: Math.max(...waits) });
  };

  /** Crea la cuenta de Auth; reemplaza un usuario inerte que ocupe el correo si lo hay (quien tiene el token es dueño del buzón). */
  const signUpClaiming = async (email: string, password: string, orphanUserId: string | null): Promise<TokenPair> => {
    let created = await sessions.signUp(email, password);
    if (created === 'exists') {
      if (orphanUserId === null) throw new ApiError('STATE_CONFLICT');
      // Borrado atómico y condicional: si entretanto se creó una cuenta con vida propia, no se borra y es 409.
      if (!(await admin.deleteInertUser(orphanUserId, email, ORPHAN_MIN_AGE_SECONDS))) throw new ApiError('STATE_CONFLICT');
      created = await sessions.signUp(email, password);
      if (created === 'exists') throw new ApiError('STATE_CONFLICT');
    }
    if (created === null) throw new ApiError('SERVICE_UNAVAILABLE');
    return created;
  };

  /** Cierra la revocación de sesiones tras un cambio de credenciales: un reintento y, si falla otra vez, 503 (no éxito en silencio). */
  const revokeSessions = async (userId: string): Promise<void> => {
    try {
      await admin.revokeAllSessions(userId);
    } catch {
      try {
        await admin.revokeAllSessions(userId);
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE');
      }
    }
  };

  /** Emite el enlace de la emisión `seq`; un 409 (el alta ya se reclamó o el enlace se reemitió después) no es un error. */
  const issueActivation = async (
    signupId: string, hospital: Readonly<{ hospitalId: string; hospitalName: string }>, seq: number, knownEmail: string | undefined,
  ): Promise<void> => {
    try {
      const recipient = knownEmail ?? await repository.assistedSignupRecipient(signupId, hospital.hospitalId);
      const token = newToken();
      const outboxId = newId();
      await repository.issueAssistedActivation(signupId, hospital.hospitalId, seq, {
        tokenHash: hashToken(token), outboxId, sealed: seal(outboxId, { recipient, token, hospitalName: hospital.hospitalName }),
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STATE_CONFLICT') return;
      throw error;
    }
  };

  return Object.freeze({
    /**
     * Autorregistro. Responde igual (neutro) exista o no ya una cuenta con ese correo: si existe no se hace nada más. La
     * sesión que devuelve Auth al registrar se descarta: la persona inicia sesión después de verificar su correo.
     */
    async registerDonor(rawEmail: string, password: string, key: string, ipSubject: string): Promise<void> {
      const started = now();
      const email = normalizeEmail(rawEmail);
      const emailSubject = hmacEmailSubject(keys.email, email);
      await rejectIfLimited([
        ['register:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS],
        ['register:email', emailSubject, EMAIL_LIMIT, EMAIL_WINDOW_SECONDS],
      ]);

      const created = await sessions.signUp(email, password);
      if (created === null) throw new ApiError('SERVICE_UNAVAILABLE');
      const token = newToken();
      const outboxId = newId();
      const issue = {
        tokenHash: hashToken(token), outboxId, sealed: seal(outboxId, { recipient: email, token }),
        actorRef: `email:${emailSubject}`, key, hash: hmacSha256Hex(keys.idempotency, JSON.stringify([email])),
      };
      if (created === 'exists') {
        // Si es un registro sin verificar, el enlace nuevo va al buzón (así quien lo perdió o venció no queda bloqueado);
        // en cualquier otro caso la RPC no hace nada y la respuesta es la misma.
        await repository.reissueDonorVerification({ email, ...issue });
      } else {
        let userId: string | undefined;
        try {
          userId = (await sessions.verifyAccessToken(created.accessToken))?.userId;
          if (!userId) throw new ApiError('SERVICE_UNAVAILABLE');
          await repository.linkDonorAccount({ userId, ...issue });
        } catch (error) {
          // La cuenta de Auth quedó sin cuenta de aplicación: se elimina para no dejar usuarios inertes (si esto falla,
          // la purga de usuarios inertes la recoge).
          if (userId) await admin.deleteInertUser(userId, email, 0).catch(() => undefined);
          throw error;
        } finally {
          await sessions.signOut(created.accessToken, 'local').catch(() => undefined);
        }
      }

      const remaining = REGISTRATION_FLOOR_MS - (now() - started);
      if (remaining > 0) await sleep(remaining);
    },

    async previewEmailVerification(token: string): Promise<ActionPreview> {
      const { expiresAt } = await repository.donorVerificationPreview(hashToken(token));
      return { action: 'verificar_email', expiresAt };
    },

    async verifyEmail(token: string, ipSubject: string): Promise<OnboardingOutcome> {
      await rejectIfLimited([['verify-email:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS]]);
      const verified = await repository.verifyDonorEmail(hashToken(token));
      if (verified.passwordSetupRequired) {
        // Quien registró la cuenta conoce su contraseña, pero quizá no es el dueño del buzón: se cierran sus sesiones y el
        // enlace de recuperación va al correo verificado. El perfil no se completa hasta fijar una contraseña nueva. Si algo
        // falla, el token ya está consumido: la persona usa «olvidé mi contraseña» (que revoca las sesiones).
        if (verified.email === '') throw new ApiError('SERVICE_UNAVAILABLE');
        await revokeSessions(verified.userId);
        const setupToken = newToken();
        const outboxId = newId();
        await repository.issuePasswordSetup(verified.userId, {
          tokenHash: hashToken(setupToken), outboxId, sealed: seal(outboxId, { recipient: verified.email, token: setupToken }),
        });
      }
      return verified.outcome;
    },

    async previewAssistedActivation(token: string): Promise<ActionPreview> {
      const { hospitalName, expiresAt } = await repository.assistedActivationPreview(hashToken(token));
      return { action: 'reclamar_alta', expiresAt, hospitalName };
    },

    /**
     * Reclama el alta asistida: crea la cuenta de Auth con la contraseña elegida por la persona (el hospital nunca la
     * conoce), la vincula con el alta y devuelve la sesión. Si el vínculo falla se elimina la cuenta recién creada.
     */
    async claimAssisted(token: string, password: string, ipSubject: string): Promise<ClaimResult> {
      await rejectIfLimited([['claim-assisted:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS]]);
      const tokenHash = hashToken(token);
      // Falla con 404/410 si el token no existe o ya no vale, antes de crear nada en Auth.
      const { email, orphanUserId } = await repository.assistedActivationPreview(tokenHash);

      const tokens = await signUpClaiming(email, password, orphanUserId);
      let userId: string | undefined;
      try {
        userId = (await sessions.verifyAccessToken(tokens.accessToken))?.userId;
        if (!userId) throw new ApiError('SERVICE_UNAVAILABLE');
        return { tokens, outcome: await repository.linkAssistedAccount(userId, tokenHash) };
      } catch (error) {
        if (userId) await admin.deleteInertUser(userId, email, 0).catch(() => undefined);
        await sessions.signOut(tokens.accessToken, 'local').catch(() => undefined);
        throw error;
      }
    },

    async previewEmailChange(token: string): Promise<ActionPreview> {
      const { expiresAt } = await repository.emailChangePreview(hashToken(token));
      return { action: 'cambiar_email', expiresAt };
    },

    /**
     * Consume el token y cambia el correo de la cuenta. El correo nuevo viaja sellado en el token (contexto = su hash). Se
     * cierran todas las sesiones: sus JWT llevan el correo viejo. Un correo ya ocupado es 409.
     */
    async verifyEmailChange(token: string, ipSubject: string): Promise<void> {
      await rejectIfLimited([['email-change:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS]]);
      const tokenHash = hashToken(token);
      const { userId, sealedEmail } = await repository.consumeEmailChange(tokenHash);
      let newEmail: string;
      try {
        newEmail = normalizeEmail(open(tokenHash, sealedEmail));
      } catch {
        throw new ApiError('INTERNAL_ERROR');
      }
      try {
        await admin.updateEmail(userId, newEmail);
      } catch (error) {
        if (error instanceof PersistenceError) throw new ApiError('STATE_CONFLICT');
        throw error;
      }
      await revokeSessions(userId);
    },

    // --- Altas asistidas del hospital del admin (el hospital sale de su membresía en SQL) -------------------------

    /**
     * Registra el alta con la sesión del admin y después emite el token y el correo con la sesión técnica: el admin no elige
     * el hash del token. La emisión es idempotente por (alta, emisión), así que un reintento con la misma clave no duplica el
     * correo; si entretanto el enlace se reemitió (409), el alta se devuelve igual.
     */
    async createAssistedSignup(
      accessToken: string, hospital: Readonly<{ hospitalId: string; hospitalName: string }>, key: string,
      input: Readonly<{ email: string; name?: string }>,
    ): Promise<AssistedSignupView> {
      const email = normalizeEmail(input.email);
      const name = input.name === undefined ? null : cleanName(input.name);
      const { signup, seq } = await repository.createAssistedSignup(accessToken, { key, hash: fingerprint([['email', email], ['name', name]]) }, { email, name });
      await issueActivation(signup.signupId, hospital, seq, email);
      return signup;
    },

    listAssistedSignups: (accessToken: string, query: PageQuery): Promise<Page<AssistedSignupView>> =>
      repository.listAssistedSignups(accessToken, query),

    getAssistedSignup: (accessToken: string, signupId: string): Promise<AssistedSignupView> =>
      repository.getAssistedSignup(accessToken, signupId),

    /**
     * Reemite el enlace de un alta del propio hospital: la RPC del admin anula los enlaces anteriores y sube la emisión; después
     * la sesión técnica emite el token y el correo. El destinatario es el correo del alta, que el hospital no puede leer: el
     * backend lo obtiene con la sesión técnica (solo de un alta reemitible del hospital de la sesión) únicamente para sellarlo.
     */
    async reissueAssistedLink(
      accessToken: string, hospital: Readonly<{ hospitalId: string; hospitalName: string }>, key: string, signupId: string,
    ): Promise<void> {
      const { seq } = await repository.reissueAssistedLink(accessToken, { key, hash: fingerprint([['signupId', signupId]]) }, signupId);
      await issueActivation(signupId, hospital, seq, undefined);
    },

    // --- Perfil propio ------------------------------------------------------------------------------------------

    getProfile: (accessToken: string): Promise<OwnProfileView> => repository.getProfile(accessToken),

    async completeOnboarding(
      accessToken: string, key: string,
      input: Readonly<{ name: string; declaredBloodType: string; isAvailable: boolean; approximateLocation: ApproximateLocation }>,
    ): Promise<OwnProfileView> {
      const name = cleanName(input.name);
      const polygonVersion = checkedLocation(input.approximateLocation);
      const { latitude, longitude } = input.approximateLocation;
      return repository.completeOnboarding(
        accessToken,
        { key, hash: fingerprint([['name', name], ['declaredBloodType', input.declaredBloodType], ['isAvailable', input.isAvailable], ['latitude', latitude], ['longitude', longitude]]) },
        { name, declaredBloodType: input.declaredBloodType, isAvailable: input.isAvailable, approximateLocation: input.approximateLocation, polygonVersion },
      );
    },

    async updateParticipation(
      accessToken: string, key: string, input: Readonly<{ isAvailable?: boolean; approximateLocation?: ApproximateLocation }>,
    ): Promise<OwnProfileView> {
      const polygonVersion = input.approximateLocation === undefined ? undefined : checkedLocation(input.approximateLocation);
      return repository.updateParticipation(
        accessToken,
        {
          key,
          hash: fingerprint([
            ['isAvailable', input.isAvailable ?? null],
            ['latitude', input.approximateLocation?.latitude ?? null],
            ['longitude', input.approximateLocation?.longitude ?? null],
          ]),
        },
        { isAvailable: input.isAvailable, approximateLocation: input.approximateLocation, polygonVersion },
      );
    },
  });
}

export type DonorRecordsService = ReturnType<typeof createDonorRecordsService>;
