import { randomUUID } from 'node:crypto';
import type { SessionGateway } from '../../../shared/auth/session-ports.js';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { hmacEmailSubject, hmacSha256Hex, type HmacKeyring } from '../../../shared/crypto/hmac.js';
import { generateActionToken, hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { AuthAdmin } from './auth-admin.ports.js';
import type { ActionTokensRepository } from './action-tokens.ports.js';
import type { AuthSessionView, CreateSessionResult } from './auth-service.js';
import type { KeyOutcome, RateLimiter, PublicIdempotency } from './identity.ports.js';

const LIMIT = 10;
const WINDOW_SECONDS = 15 * 60;
const RECOVERY_FLOOR_MS = 150;

/** Cifra el correo de un tipo con el id del outbox como AAD (lo aporta el módulo de correo). */
export type SealEmail = (outboxId: string, payload: Readonly<{ recipient: string; token: string; hospitalName?: string }>) => string;

export interface ActionTokensServiceDependencies {
  readonly repository: ActionTokensRepository;
  readonly sessions: Pick<SessionGateway, 'signUp' | 'signOut' | 'verifyAccessToken'>;
  readonly admin: AuthAdmin;
  readonly limiter: RateLimiter;
  readonly publicKeys: PublicIdempotency;
  readonly keys: Pick<HmacKeyring, 'email' | 'idempotency'>;
  readonly seal: SealEmail;
  /** Nombre público del hospital (para el correo de invitación); lanza si no existe. */
  readonly hospitalName: (accessToken: string, hospitalId: string) => Promise<string>;
  readonly newToken?: () => string;
  readonly newId?: () => string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Casos de uso por token de un solo uso (F2b). El token en claro nace aquí, viaja solo dentro del correo cifrado
 * y en la base solo existe su hash; nunca se registra. Las respuestas públicas son neutras o genéricas.
 */
export function createActionTokensService({
  repository, sessions, admin, limiter, publicKeys, keys, seal, hospitalName,
  newToken = generateActionToken, newId = randomUUID, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ActionTokensServiceDependencies) {
  const rejectIfLimited = async (checks: ReadonlyArray<readonly [string, string]>): Promise<void> => {
    const waits: number[] = [];
    for (const [bucket, subject] of checks) {
      const decision = await limiter.consume(bucket, subject, LIMIT, WINDOW_SECONDS);
      if (!decision.allowed) waits.push(decision.retryAfterSeconds);
    }
    if (waits.length > 0) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: Math.max(...waits) });
  };

  const assertKeyOk = (outcome: KeyOutcome): void => {
    if (outcome === 'ok') return;
    throw new ApiError(outcome === 'invalid' ? 'BAD_REQUEST' : 'STATE_CONFLICT');
  };

  return Object.freeze({
    /** Superadmin + AAL2 + step-up (lo exige el router y la RPC). Responde neutro; el correo sale por el outbox. */
    async inviteAdmin(accessToken: string, key: string, input: Readonly<{ email: string; hospitalId: string }>): Promise<void> {
      const email = normalizeEmail(input.email);
      const hospitalId = input.hospitalId.toLowerCase();
      let name: string;
      try {
        name = await hospitalName(accessToken, hospitalId);
      } catch (error) {
        // El contrato de esta operación no declara 404: un hospital inexistente es un valor inválido.
        if (error instanceof ApiError && error.code === 'RESOURCE_NOT_FOUND') throw new ApiError('VALIDATION_FAILED');
        throw error;
      }
      const token = newToken();
      const outboxId = newId();
      await repository.inviteAdmin(
        accessToken,
        { key, hash: fingerprint([['email', email], ['hospitalId', hospitalId]]) },
        { email, hospitalId, tokenHash: hashToken(token), outboxId, sealed: seal(outboxId, { recipient: email, token, hospitalName: name }) },
      );
    },

    previewAdminInvitation: (token: string) => repository.adminInvitationPreview(hashToken(token)),

    /**
     * Reclama la invitación: crea la cuenta de Auth con la contraseña elegida, la vincula con la invitación y
     * devuelve la sesión AAL1 (el admin debe enrolar MFA). Si el vínculo falla se elimina la cuenta recién creada.
     */
    async claimAdminInvitation(
      token: string, password: string, key: string, ipSubject: string,
    ): Promise<CreateSessionResult> {
      await rejectIfLimited([['claim:ip', ipSubject]]);
      const tokenHash = hashToken(token);
      // Falla con 404/410 si el token no existe o ya no vale, antes de crear nada en Auth.
      const { email } = await repository.adminInvitationPreview(tokenHash);

      const created = await sessions.signUp(email, password);
      if (created === 'exists') throw new ApiError('STATE_CONFLICT');
      if (created === null) throw new ApiError('SERVICE_UNAVAILABLE');

      const userId = (await sessions.verifyAccessToken(created.accessToken))?.userId;
      try {
        if (!userId) throw new ApiError('SERVICE_UNAVAILABLE');
        const linked = await repository.linkAdminAccount(created.accessToken, { key, hash: fingerprint([['tokenHash', tokenHash]]) }, tokenHash);
        const view: AuthSessionView = Object.freeze({
          actor: Object.freeze({ role: 'admin_hospitalario', displayName: linked.hospitalName.slice(0, 120), hospitalName: linked.hospitalName }),
          aal: 1 as const,
          mfaRequired: true,
        });
        return { tokens: created, view };
      } catch (error) {
        // La cuenta de Auth quedó sin cuenta de aplicación: se elimina para no dejar usuarios inertes.
        if (userId) await admin.deleteUser(userId).catch(() => undefined);
        await sessions.signOut(created.accessToken, 'local').catch(() => undefined);
        throw error;
      }
    },

    /** Siempre responde igual (neutro): exista o no la cuenta. */
    async requestPasswordRecovery(rawEmail: string, key: string, ipSubject: string): Promise<void> {
      const started = now();
      const email = normalizeEmail(rawEmail);
      const emailSubject = hmacEmailSubject(keys.email, email);
      await rejectIfLimited([['recovery:ip', ipSubject], ['recovery:email', emailSubject]]);
      assertKeyOk(await publicKeys.record(
        `email:${emailSubject}`, 'requestPasswordRecovery', key, hmacSha256Hex(keys.idempotency, JSON.stringify([email])),
      ));

      const token = newToken();
      const outboxId = newId();
      await repository.requestRecovery({ email, tokenHash: hashToken(token), outboxId, sealed: seal(outboxId, { recipient: email, token }) });

      // Iguala el tiempo con el camino en que no había cuenta (el RPC responde igual en ambos).
      const remaining = RECOVERY_FLOOR_MS - (now() - started);
      if (remaining > 0) await sleep(remaining);
    },

    /** Consume el token, cambia la contraseña y revoca todas las sesiones anteriores. */
    async completePasswordReset(token: string, newPassword: string): Promise<void> {
      const { userId } = await repository.consumePasswordReset(hashToken(token));
      await admin.updatePassword(userId, newPassword);
      await admin.revokeAllSessions(userId);
    },
  });
}

export type ActionTokensService = ReturnType<typeof createActionTokensService>;
