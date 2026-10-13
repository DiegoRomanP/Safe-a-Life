import { randomUUID } from 'node:crypto';
import type { SessionGateway } from '../../../shared/auth/session-ports.js';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { hmacEmailSubject, hmacSha256Hex, type HmacKeyring } from '../../../shared/crypto/hmac.js';
import { generateActionToken, hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { AuthAdmin } from './auth-admin.ports.js';
import type { ActionTokensRepository } from './action-tokens.ports.js';
import type { AuthSessionView, CreateSessionResult } from './auth-service.js';
import type { RateLimiter } from './identity.ports.js';

const IP_LIMIT = 10;
const IP_WINDOW_SECONDS = 15 * 60;
/** Por correo: 3 solicitudes por hora (cada una envía un correo a la víctima y anula el enlace anterior). */
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_SECONDS = 60 * 60;
const RECOVERY_FLOOR_MS = 150;
/** Un usuario de Auth más joven que esto puede ser el registro en curso del propio invitado: no se reemplaza. */
const ORPHAN_MIN_AGE_SECONDS = 60;

/** Cifra el correo de un tipo con el id del outbox como AAD (lo aporta el módulo de correo). */
export type SealEmail = (outboxId: string, payload: Readonly<{ recipient: string; token: string; hospitalName?: string }>) => string;

export interface ActionTokensServiceDependencies {
  readonly repository: ActionTokensRepository;
  readonly sessions: Pick<SessionGateway, 'signUp' | 'signOut' | 'verifyAccessToken'>;
  readonly admin: AuthAdmin;
  readonly limiter: RateLimiter;
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
 * y en la base solo existe su hash; nunca se registra. Las respuestas públicas son neutras o genéricas, y las RPC
 * públicas las ejecuta la identidad técnica del backend: un cliente directo de PostgREST no puede elegir hashes.
 */
export function createActionTokensService({
  repository, sessions, admin, limiter, keys, seal, hospitalName,
  newToken = generateActionToken, newId = randomUUID, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ActionTokensServiceDependencies) {
  const rejectIfLimited = async (checks: ReadonlyArray<readonly [string, string, number, number]>): Promise<void> => {
    const waits: number[] = [];
    for (const [bucket, subject, limit, windowSeconds] of checks) {
      const decision = await limiter.consume(bucket, subject, limit, windowSeconds);
      if (!decision.allowed) waits.push(decision.retryAfterSeconds);
    }
    if (waits.length > 0) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: Math.max(...waits) });
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
     * Un usuario de Auth inerte que ocupe el correo invitado se reemplaza: quien tiene el token es dueño del buzón.
     */
    async claimAdminInvitation(token: string, password: string, key: string, ipSubject: string): Promise<CreateSessionResult> {
      await rejectIfLimited([['claim:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS]]);
      const tokenHash = hashToken(token);
      // Falla con 404/410 si el token no existe o ya no vale, antes de crear nada en Auth.
      const { email, orphanUserId } = await repository.adminInvitationPreview(tokenHash);

      let created = await sessions.signUp(email, password);
      if (created === 'exists') {
        if (orphanUserId === null) throw new ApiError('STATE_CONFLICT');
        // Borrado atómico y condicional: si entretanto se creó una cuenta con vida propia, no se borra y es 409.
        if (!(await admin.deleteInertUser(orphanUserId, email, ORPHAN_MIN_AGE_SECONDS))) throw new ApiError('STATE_CONFLICT');
        created = await sessions.signUp(email, password);
        if (created === 'exists') throw new ApiError('STATE_CONFLICT');
      }
      if (created === null) throw new ApiError('SERVICE_UNAVAILABLE');

      let userId: string | undefined;
      try {
        userId = (await sessions.verifyAccessToken(created.accessToken))?.userId;
        if (!userId) throw new ApiError('SERVICE_UNAVAILABLE');
        const linked = await repository.linkAdminAccount(created.accessToken, { key, hash: fingerprint([['tokenHash', tokenHash]]) }, tokenHash);
        const view: AuthSessionView = Object.freeze({
          actor: Object.freeze({ role: 'admin_hospitalario', displayName: linked.hospitalName.slice(0, 120), hospitalName: linked.hospitalName }),
          aal: 1 as const,
          mfaRequired: true,
        });
        return { tokens: created, view };
      } catch (error) {
        // La cuenta de Auth quedó sin cuenta de aplicación: se elimina para no dejar usuarios inertes (si esto falla,
        // el siguiente reclamo la reemplaza como huérfana).
        if (userId) await admin.deleteInertUser(userId, email, 0).catch(() => undefined);
        await sessions.signOut(created.accessToken, 'local').catch(() => undefined);
        throw error;
      }
    },

    /** Siempre responde igual (neutro): exista o no la cuenta. La idempotencia la resuelve la RPC (un replay no repite el correo). */
    async requestPasswordRecovery(rawEmail: string, key: string, ipSubject: string): Promise<void> {
      const started = now();
      const email = normalizeEmail(rawEmail);
      const emailSubject = hmacEmailSubject(keys.email, email);
      await rejectIfLimited([
        ['recovery:ip', ipSubject, IP_LIMIT, IP_WINDOW_SECONDS],
        ['recovery:email', emailSubject, EMAIL_LIMIT, EMAIL_WINDOW_SECONDS],
      ]);

      const token = newToken();
      const outboxId = newId();
      await repository.requestRecovery({
        email, tokenHash: hashToken(token), outboxId, sealed: seal(outboxId, { recipient: email, token }),
        actorRef: `email:${emailSubject}`, key, hash: hmacSha256Hex(keys.idempotency, JSON.stringify([email])),
      });

      // Iguala el tiempo con el camino en que no había cuenta (la RPC responde igual en ambos).
      const remaining = RECOVERY_FLOOR_MS - (now() - started);
      if (remaining > 0) await sleep(remaining);
    },

    /**
     * Consume el token, revoca las sesiones, cambia la contraseña y revoca otra vez. Revocar PRIMERO falla cerrado: si
     * Auth cae a mitad, las sesiones anteriores ya no existen; la segunda revocación cierra las que se hubieran abierto
     * con la contraseña vieja entre ambos pasos (sus access tokens valen hasta 600 s).
     */
    async completePasswordReset(token: string, newPassword: string): Promise<void> {
      const { userId } = await repository.consumePasswordReset(hashToken(token));
      await admin.revokeAllSessions(userId);
      await admin.updatePassword(userId, newPassword);
      // Si la revocación final falla (tras un reintento) el cambio ya se hizo pero podrían sobrevivir sesiones abiertas con la
      // contraseña vieja: no se responde éxito en silencio. El token ya está consumido; el usuario puede pedir otro enlace.
      try {
        await admin.revokeAllSessions(userId);
      } catch {
        try {
          await admin.revokeAllSessions(userId);
        } catch {
          throw new ApiError('SERVICE_UNAVAILABLE');
        }
      }
    },
  });
}

export type ActionTokensService = ReturnType<typeof createActionTokensService>;
