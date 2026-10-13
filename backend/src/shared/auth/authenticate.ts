import type { Request, RequestHandler } from 'express';
import { PersistenceError, UpstreamRateLimitedError } from '../persistence/errors.js';
import { ApiError } from '../http/errors.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from '../http/cookies.js';
import { setPrincipal, setSessionTokens } from './principal.js';
import { clearSessionCookies, setSessionCookies } from './session-cookies.js';
import type { ActorResolver, SessionVerifier, TokenPair, VerifiedClaims } from './session-ports.js';

export interface AuthenticateDependencies {
  readonly verifier: SessionVerifier;
  readonly actors: ActorResolver;
  /**
   * Límite de renovaciones por IP, consultado ANTES de llamar a Supabase Auth (cuota compartida por
   * IP del backend). Devuelve los segundos a esperar si se excedió, o `null`.
   */
  readonly refreshGate?: (req: Request) => Promise<number | null>;
  /**
   * Política de renovación por ruta (por defecto `normal`):
   * - `skip` (login): nunca renueva; se trata como sin sesión y no se tocan cookies.
   * - `lenient` (logout): intenta renovar para poder revocar la sesión, pero un límite agotado o un 429
   *   del proveedor equivalen a «sin sesión» en vez de abortar: salir nunca debe quedar bloqueado.
   */
  readonly renewalPolicy?: (req: Request) => RenewalPolicy;
}

export type RenewalPolicy = 'normal' | 'skip' | 'lenient';

/** Los refresh tokens de Supabase son cadenas opacas cortas; descartar formas imposibles sin llamar al proveedor. */
const REFRESH_TOKEN_SHAPE = /^[A-Za-z0-9._-]{4,200}$/;

/**
 * Middleware de autenticación para `/api` (ADR-004). Nunca rechaza por sí mismo:
 * si no hay sesión válida simplemente no fija `res.locals.principal` y los guards
 * deciden. El actor (rol y membresía) se resuelve en cada petición.
 *
 * 1. Valida el access token de la cookie.
 * 2. Si falta, es inválido o venció y hay refresh token, lo renueva y reescribe
 *    ambas cookies; si el refresh falla, expira las dos cookies.
 * 3. Resuelve el actor con el JWT del usuario.
 */
export function authenticate({ verifier, actors, refreshGate, renewalPolicy }: AuthenticateDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req.get('cookie'));
      let accessToken = cookies[ACCESS_COOKIE];
      let refreshToken: string | undefined = cookies[REFRESH_COOKIE];
      let claims: VerifiedClaims | null = accessToken ? await verifier.verifyAccessToken(accessToken) : null;

      const policy = renewalPolicy?.(req) ?? 'normal';
      if (!claims && policy === 'skip') {
        next();
        return;
      }

      if (!claims && refreshToken && !REFRESH_TOKEN_SHAPE.test(refreshToken)) {
        clearSessionCookies(res);
        refreshToken = undefined;
      }

      if (!claims && refreshToken) {
        const wait = await refreshGate?.(req);
        if (wait !== null && wait !== undefined) {
          if (policy === 'lenient') {
            next();
            return;
          }
          throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: wait });
        }
        let renewed: TokenPair | null;
        try {
          renewed = await verifier.refresh(refreshToken);
        } catch (error) {
          if (policy === 'lenient' && error instanceof UpstreamRateLimitedError) {
            next();
            return;
          }
          throw error;
        }
        claims = renewed ? await verifier.verifyAccessToken(renewed.accessToken) : null;
        if (renewed && claims) {
          accessToken = renewed.accessToken;
          refreshToken = renewed.refreshToken;
          setSessionCookies(res, renewed);
        } else {
          clearSessionCookies(res);
        }
      }

      if (!claims || !accessToken) {
        next();
        return;
      }

      // Un token que vence entre la verificación y esta RPC equivale a «sin sesión», no a un 401 global.
      let actor;
      try {
        actor = await actors.currentActor(accessToken);
      } catch (error) {
        if (!(error instanceof PersistenceError && error.reason === 'jwt')) throw error;
        next();
        return;
      }
      if (refreshToken) setSessionTokens(res, Object.freeze({ accessToken, refreshToken, expiresIn: 0 }));
      if (actor) {
        setPrincipal(res, Object.freeze({
          userId: claims.userId,
          sessionId: claims.sessionId,
          aal: claims.aal,
          amr: claims.amr,
          accessToken,
          role: actor.role,
          displayName: actor.displayName,
          hospital: actor.hospital,
        }));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
