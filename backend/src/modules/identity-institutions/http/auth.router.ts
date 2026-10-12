import type { Express } from 'express';
import { setSessionCookies, clearSessionCookies } from '../../../shared/auth/session-cookies.js';
import { createCsrfToken } from '../../../shared/crypto/csrf.js';
import { clientIpSubject } from '../../../shared/http/client-ip.js';
import { sendData, sendNoContent } from '../../../shared/http/respond.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import { viewOf, type createAuthService } from '../application/auth-service.js';
import { findPrincipal } from '../../../shared/auth/principal.js';
import { guardsFor, parse, requireIdempotencyKey, requirePrincipal, requireTokens, type HttpSecrets } from './identity-http.js';

export interface AuthRouterDependencies {
  readonly auth: ReturnType<typeof createAuthService>;
  readonly secrets: HttpSecrets & Readonly<{ ipHmac: string }>;
}

/** Sesión, CSRF, MFA y step-up (ADR-004). El login es público; el resto exige cookie. */
export function registerAuthRoutes(app: Express, { auth, secrets }: AuthRouterDependencies): void {
  const guards = guardsFor(secrets);
  const createSession = compileOperation('createSession');
  const getCurrentSession = compileOperation('getCurrentSession');
  const getCsrfToken = compileOperation('getCsrfToken');
  const deleteCurrentSession = compileOperation('deleteCurrentSession');
  const enrollMfaFactor = compileOperation('enrollMfaFactor');
  const verifyMfaChallenge = compileOperation('verifyMfaChallenge');
  const verifyStepUp = compileOperation('verifyStepUp');

  app.post('/api/v1/auth/sessions', async (req, res) => {
    createSession.parseQuery(req.query as Record<string, unknown>);
    const key = requireIdempotencyKey(req);
    const body = parse<{ email: string; password: string }>(createSession, 'body', req);
    const { tokens, view } = await auth.createSession(body, { idempotencyKey: key, ipSubject: clientIpSubject(req, secrets.ipHmac) });
    // Validar la salida ANTES de emitir cookies: un 500 no debe entregar una sesión.
    const data = (createSession.assertSuccess({ data: view }) as { data: unknown }).data;
    setSessionCookies(res, tokens);
    sendData(res, 200, data);
  });

  app.get('/api/v1/auth/session', ...guards.session, (req, res) => {
    getCurrentSession.parseQuery(req.query as Record<string, unknown>);
    const principal = requirePrincipal(res);
    sendData(res, 200, (getCurrentSession.assertSuccess({ data: viewOf(principal, principal.aal) }) as { data: unknown }).data);
  });

  app.get('/api/v1/auth/csrf-token', ...guards.session, (req, res) => {
    getCsrfToken.parseQuery(req.query as Record<string, unknown>);
    const token = createCsrfToken(secrets.csrf, requirePrincipal(res).sessionId);
    sendData(res, 200, (getCsrfToken.assertSuccess({ data: { token } }) as { data: unknown }).data);
  });

  // Sin sesión vigente el logout responde 401 pero expira las cookies: así un usuario con cookies
  // obsoletas (HttpOnly, inaccesibles para el frontend) puede limpiar su estado.
  app.delete('/api/v1/auth/sessions/current', (_req, res, next) => {
    if (!findPrincipal(res)) clearSessionCookies(res);
    next();
  }, ...guards.sessionWrite, async (req, res) => {
    deleteCurrentSession.parseQuery(req.query as Record<string, unknown>);
    requireIdempotencyKey(req);
    await auth.signOut(requirePrincipal(res).accessToken);
    clearSessionCookies(res);
    sendNoContent(res);
  });

  app.post('/api/v1/auth/mfa-enrollments', ...guards.sessionWrite, async (req, res) => {
    enrollMfaFactor.parseQuery(req.query as Record<string, unknown>);
    const enrollment = await auth.enrollMfa(requirePrincipal(res), requireTokens(res), requireIdempotencyKey(req));
    sendData(res, 201, (enrollMfaFactor.assertSuccess({ data: enrollment }) as { data: unknown }).data);
  });

  app.post('/api/v1/auth/mfa-verifications', ...guards.sessionWrite, async (req, res) => {
    verifyMfaChallenge.parseQuery(req.query as Record<string, unknown>);
    const key = requireIdempotencyKey(req);
    const body = parse<{ challengeId: string; code: string }>(verifyMfaChallenge, 'body', req);
    const { tokens, view } = await auth.verifyMfa(requirePrincipal(res), requireTokens(res), body, key);
    const data = (verifyMfaChallenge.assertSuccess({ data: view }) as { data: unknown }).data;
    setSessionCookies(res, tokens);
    sendData(res, 200, data);
  });

  app.post('/api/v1/auth/step-up-verifications', ...guards.sessionWrite, async (req, res) => {
    verifyStepUp.parseQuery(req.query as Record<string, unknown>);
    const key = requireIdempotencyKey(req);
    const body = parse<{ code: string }>(verifyStepUp, 'body', req);
    const { tokens, verifiedUntil } = await auth.verifyStepUp(requirePrincipal(res), requireTokens(res), body, key);
    const data = (verifyStepUp.assertSuccess({ data: { verifiedUntil } }) as { data: unknown }).data;
    setSessionCookies(res, tokens);
    sendData(res, 200, data);
  });

}
