import type { Request, RequestHandler } from 'express';
import { PersistenceError } from '../persistence/errors.js';
import { ApiError } from '../http/errors.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from '../http/cookies.js';
import { setPrincipal, setSessionTokens } from './principal.js';
import { clearSessionCookies, setSessionCookies } from './session-cookies.js';
import type { ActorResolver, SessionVerifier, VerifiedClaims } from './session-ports.js';

export interface AuthenticateDependencies {
  readonly verifier: SessionVerifier;
  readonly actors: ActorResolver;
  /**
   * Límite de renovaciones por IP, consultado ANTES de llamar a Supabase Auth (cuota compartida por
   * IP del backend). Devuelve los segundos a esperar si se excedió, o `null`.
   */
  readonly refreshGate?: (req: Request) => Promise<number | null>;
}

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
export function authenticate({ verifier, actors, refreshGate }: AuthenticateDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req.get('cookie'));
      let accessToken = cookies[ACCESS_COOKIE];
      let refreshToken: string | undefined = cookies[REFRESH_COOKIE];
      let claims: VerifiedClaims | null = accessToken ? await verifier.verifyAccessToken(accessToken) : null;

      if (!claims && refreshToken && !REFRESH_TOKEN_SHAPE.test(refreshToken)) {
        clearSessionCookies(res);
        refreshToken = undefined;
      }

      if (!claims && refreshToken) {
        const wait = await refreshGate?.(req);
        if (wait !== null && wait !== undefined) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: wait });
        const renewed = await verifier.refresh(refreshToken);
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
