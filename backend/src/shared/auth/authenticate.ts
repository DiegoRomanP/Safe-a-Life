import type { RequestHandler } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from '../http/cookies.js';
import { setPrincipal } from './principal.js';
import { clearSessionCookies, setSessionCookies } from './session-cookies.js';
import type { ActorResolver, SessionVerifier, VerifiedClaims } from './session-ports.js';

export interface AuthenticateDependencies {
  readonly verifier: SessionVerifier;
  readonly actors: ActorResolver;
}

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
export function authenticate({ verifier, actors }: AuthenticateDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req.get('cookie'));
      let accessToken = cookies[ACCESS_COOKIE];
      const refreshToken = cookies[REFRESH_COOKIE];
      let claims: VerifiedClaims | null = accessToken ? await verifier.verifyAccessToken(accessToken) : null;

      if (!claims && refreshToken) {
        const renewed = await verifier.refresh(refreshToken);
        claims = renewed ? await verifier.verifyAccessToken(renewed.accessToken) : null;
        if (renewed && claims) {
          accessToken = renewed.accessToken;
          setSessionCookies(res, renewed);
        } else {
          clearSessionCookies(res);
        }
      }

      if (!claims || !accessToken) {
        next();
        return;
      }

      const actor = await actors.currentActor(accessToken);
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
