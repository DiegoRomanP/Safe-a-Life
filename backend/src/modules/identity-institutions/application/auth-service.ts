import type { Principal } from '../../../shared/auth/principal.js';
import type { ActorInfo, SessionGateway, TokenPair } from '../../../shared/auth/session-ports.js';
import { hmacEmailSubject, hmacSha256Hex } from '../../../shared/crypto/hmac.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { IdentityDependencies, KeyOutcome } from './identity.ports.js';

const LOGIN_LIMIT = 10;
const MFA_LIMIT = 10;
const WINDOW_SECONDS = 15 * 60;
const STEP_UP_SECONDS = 300;

export type AuthSessionView = Readonly<{
  actor: Readonly<{ role: string; displayName: string; hospitalName?: string }>;
  aal: 1 | 2;
  mfaRequired: boolean;
  mfaChallengeId?: string;
}>;

export type CreateSessionResult = Readonly<{ tokens: TokenPair; view: AuthSessionView }>;

export interface AuthServiceConfig {
  readonly emailHmacSecret: string;
}

function needsMfa(role: ActorInfo['role']): boolean {
  return role === 'admin_hospitalario' || role === 'superadmin';
}

export function viewOf(actor: Pick<Principal, 'role' | 'displayName' | 'hospital'>, aal: 'aal1' | 'aal2', mfaChallengeId?: string): AuthSessionView {
  return Object.freeze({
    actor: Object.freeze({
      role: actor.role,
      displayName: actor.displayName,
      ...(actor.role === 'admin_hospitalario' && actor.hospital ? { hospitalName: actor.hospital.hospitalName } : {}),
    }),
    aal: aal === 'aal2' ? 2 : 1,
    mfaRequired: needsMfa(actor.role) && aal !== 'aal2',
    ...(mfaChallengeId ? { mfaChallengeId } : {}),
  });
}

function assertKeyOk(outcome: KeyOutcome): void {
  if (outcome === 'ok') return;
  throw new ApiError(outcome === 'invalid' ? 'BAD_REQUEST' : 'STATE_CONFLICT');
}

export function createAuthService(
  sessions: SessionGateway,
  { actors, limiter, publicKeys, userKeys }: IdentityDependencies,
  { emailHmacSecret }: AuthServiceConfig,
) {
  const rateLimit = async (bucket: string, subject: string, limit: number): Promise<number | null> => {
    const decision = await limiter.consume(bucket, subject, limit, WINDOW_SECONDS);
    return decision.allowed ? null : decision.retryAfterSeconds;
  };
  const rejectIfLimited = (...waits: Array<number | null>): void => {
    const blocked = waits.filter((wait): wait is number => wait !== null);
    if (blocked.length > 0) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: Math.max(...blocked) });
  };

  return Object.freeze({
    /**
     * Login (createSession). Rate limit por IP y por HMAC del email antes de
     * tocar Auth; credenciales inválidas y usuarios sin cuenta de aplicación dan
     * el mismo 401. La idempotencia se registra solo tras un login correcto.
     */
    async createSession(
      input: Readonly<{ email: string; password: string }>,
      meta: Readonly<{ idempotencyKey: string; ipSubject: string }>,
    ): Promise<CreateSessionResult> {
      const emailSubject = hmacEmailSubject(emailHmacSecret, input.email);
      rejectIfLimited(
        await rateLimit('login:ip', meta.ipSubject, LOGIN_LIMIT),
        await rateLimit('login:email', emailSubject, LOGIN_LIMIT),
      );

      const tokens = await sessions.signIn(input.email, input.password);
      if (!tokens) throw new ApiError('AUTHENTICATION_REQUIRED');

      const actor = await actors.currentActor(tokens.accessToken);
      if (!actor) {
        await sessions.signOut(tokens.accessToken);
        throw new ApiError('AUTHENTICATION_REQUIRED');
      }

      const outcome = await publicKeys.record(
        `email:${emailSubject}`, 'createSession', meta.idempotencyKey,
        hmacSha256Hex(emailHmacSecret, JSON.stringify([input.email.trim().toLowerCase(), input.password])),
      );
      if (outcome !== 'ok') {
        await sessions.signOut(tokens.accessToken);
        assertKeyOk(outcome);
      }

      let challengeId: string | undefined;
      if (needsMfa(actor.role)) {
        const verified = (await sessions.listTotpFactors(tokens)).find((factor) => factor.verified);
        if (verified) challengeId = (await sessions.challenge(tokens, verified.factorId)) ?? undefined;
      }
      return { tokens, view: viewOf({ ...actor }, 'aal1', challengeId) };
    },

    /**
     * Enrola el factor TOTP. Solo admin/superadmin sin factor verificado; los
     * factores pendientes anteriores se descartan para poder repetir el alta.
     */
    async enrollMfa(principal: Principal, tokens: TokenPair, key: string) {
      if (!needsMfa(principal.role)) throw new ApiError('ACCESS_DENIED');
      assertKeyOk(await userKeys.consume(principal.accessToken, 'enrollMfaFactor', key, hmacSha256Hex(emailHmacSecret, principal.userId)));

      const factors = await sessions.listTotpFactors(tokens);
      if (factors.some((factor) => factor.verified)) throw new ApiError('STATE_CONFLICT');
      for (const factor of factors) await sessions.unenrollFactor(tokens, factor.factorId);

      const enrollment = await sessions.enrollTotp(tokens);
      const challengeId = enrollment ? await sessions.challenge(tokens, enrollment.factorId) : null;
      if (!enrollment || !challengeId) throw new ApiError('STATE_CONFLICT');
      return Object.freeze({ factorId: enrollment.factorId, otpauthUri: enrollment.otpauthUri, challengeId });
    },

    /** Completa el reto TOTP (alta del factor o login) y eleva la sesión a AAL2. */
    async verifyMfa(
      principal: Principal,
      tokens: TokenPair,
      input: Readonly<{ challengeId: string; code: string }>,
      key: string,
    ): Promise<Readonly<{ tokens: TokenPair; view: AuthSessionView }>> {
      if (!needsMfa(principal.role)) throw new ApiError('ACCESS_DENIED');
      if (principal.aal === 'aal2') throw new ApiError('STATE_CONFLICT');
      rejectIfLimited(await rateLimit('mfa:user', hmacSha256Hex(emailHmacSecret, `mfa:${principal.userId}`), MFA_LIMIT));
      assertKeyOk(await userKeys.consume(principal.accessToken, 'verifyMfaChallenge', key, hmacSha256Hex(emailHmacSecret, JSON.stringify([input.challengeId, input.code]))));

      const factor = (await sessions.listTotpFactors(tokens))[0];
      if (!factor) throw new ApiError('STATE_CONFLICT');
      const elevated = await sessions.verify(tokens, factor.factorId, input.challengeId, input.code);
      if (!elevated) throw new ApiError('AUTHENTICATION_REQUIRED');
      return { tokens: elevated, view: viewOf(principal, 'aal2') };
    },

    /** Step-up: nuevo TOTP sobre el factor verificado; devuelve los tokens y hasta cuándo vale. */
    async verifyStepUp(
      principal: Principal,
      tokens: TokenPair,
      input: Readonly<{ code: string }>,
      key: string,
    ): Promise<Readonly<{ tokens: TokenPair; verifiedUntil: string }>> {
      if (!needsMfa(principal.role)) throw new ApiError('ACCESS_DENIED');
      if (principal.aal !== 'aal2') throw new ApiError('MFA_REQUIRED');
      rejectIfLimited(await rateLimit('mfa:user', hmacSha256Hex(emailHmacSecret, `mfa:${principal.userId}`), MFA_LIMIT));
      assertKeyOk(await userKeys.consume(principal.accessToken, 'verifyStepUp', key, hmacSha256Hex(emailHmacSecret, input.code)));

      const factor = (await sessions.listTotpFactors(tokens)).find((candidate) => candidate.verified);
      if (!factor) throw new ApiError('STATE_CONFLICT');
      const elevated = await sessions.challengeAndVerify(tokens, factor.factorId, input.code);
      if (!elevated) throw new ApiError('AUTHENTICATION_REQUIRED');

      const claims = await sessions.verifyAccessToken(elevated.accessToken);
      const verifiedAt = Math.max(0, ...(claims?.amr ?? []).filter(({ method }) => method === 'totp').map(({ timestamp }) => timestamp));
      const anchor = verifiedAt > 0 ? verifiedAt : Math.floor(Date.now() / 1000);
      return { tokens: elevated, verifiedUntil: new Date((anchor + STEP_UP_SECONDS) * 1000).toISOString() };
    },

    async signOut(accessToken: string): Promise<void> {
      await sessions.signOut(accessToken);
    },
  });
}

