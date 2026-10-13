import type { Express } from 'express';
import { setSessionCookies } from '../../../shared/auth/session-cookies.js';
import { clientIpSubject } from '../../../shared/http/client-ip.js';
import { sendData } from '../../../shared/http/respond.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import type { ActionTokensService } from '../application/action-tokens-service.js';
import { guardsFor, noQuery, ok, parse, requireIdempotencyKey, requirePrincipal, type HttpSecrets } from './identity-http.js';

export interface ActionTokensRouterDependencies {
  readonly tokens: ActionTokensService;
  readonly secrets: HttpSecrets & Readonly<{ ipHmac: string }>;
}

/** Mensajes neutros: no revelan si la cuenta existe ni el estado interno. */
const INVITATION_STARTED = 'Si la solicitud puede procesarse, el invitado recibirá instrucciones.';
const RECOVERY_NEUTRAL = 'Si la solicitud puede procesarse, recibirás instrucciones.';
const PASSWORD_CHANGED = 'Tu contraseña fue actualizada. Inicia sesión de nuevo.';

/**
 * Invitación de admins hospitalarios y recuperación de contraseña por token de un solo uso (F2b). Las rutas con
 * token son públicas: la autorización es el propio secreto, que nunca se registra (las cabeceras globales ya
 * impiden caché y `Referer`).
 */
export function registerActionTokenRoutes(app: Express, { tokens, secrets }: ActionTokensRouterDependencies): void {
  const guards = guardsFor(secrets);
  const inviteAdmin = compileOperation('inviteHospitalAdmin');
  const previewInvitation = compileOperation('getHospitalAdminInvitationPreview');
  const claimInvitation = compileOperation('claimHospitalAdminInvitation');
  const requestRecovery = compileOperation('requestPasswordRecovery');
  const completeReset = compileOperation('completePasswordReset');

  // RNF-SEC-05: invitar a un admin exige AAL2 y step-up (CSRF antes que el step-up, ADR-004).
  app.post('/api/v1/superadmin/hospital-admin-invitations', ...guards.superadminStepUp, async (req, res) => {
    noQuery(inviteAdmin, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ email: string; hospitalId: string }>(inviteAdmin, 'body', req);
    await tokens.inviteAdmin(requirePrincipal(res).accessToken, key, body);
    sendData(res, 202, ok(inviteAdmin, { message: INVITATION_STARTED }));
  });

  app.get('/api/v1/hospital-admin-invitation-actions/:token', async (req, res) => {
    noQuery(previewInvitation, req);
    const { token } = parse<{ token: string }>(previewInvitation, 'params', req);
    const { hospitalName, expiresAt } = await tokens.previewAdminInvitation(token);
    sendData(res, 200, ok(previewInvitation, { hospitalName, role: 'admin_hospitalario', expiresAt }));
  });

  app.post('/api/v1/hospital-admin-invitation-actions/:token/claim', async (req, res) => {
    noQuery(claimInvitation, req);
    const { token } = parse<{ token: string }>(claimInvitation, 'params', req);
    const key = requireIdempotencyKey(req);
    const { password } = parse<{ password: string }>(claimInvitation, 'body', req);
    const { tokens: session, view } = await tokens.claimAdminInvitation(token, password, key, clientIpSubject(req, secrets.ipHmac));
    // Validar la salida ANTES de emitir cookies: un 500 no debe entregar una sesión.
    const data = ok(claimInvitation, view);
    setSessionCookies(res, session);
    sendData(res, 201, data);
  });

  app.post('/api/v1/auth/password-recovery-requests', async (req, res) => {
    noQuery(requestRecovery, req);
    const key = requireIdempotencyKey(req);
    const { email } = parse<{ email: string }>(requestRecovery, 'body', req);
    await tokens.requestPasswordRecovery(email, key, clientIpSubject(req, secrets.ipHmac));
    sendData(res, 202, ok(requestRecovery, { message: RECOVERY_NEUTRAL }));
  });

  app.post('/api/v1/auth/password-reset-actions/:token', async (req, res) => {
    noQuery(completeReset, req);
    const { token } = parse<{ token: string }>(completeReset, 'params', req);
    requireIdempotencyKey(req);
    const { newPassword } = parse<{ newPassword: string }>(completeReset, 'body', req);
    await tokens.completePasswordReset(token, newPassword);
    sendData(res, 200, ok(completeReset, { message: PASSWORD_CHANGED }));
  });
}
