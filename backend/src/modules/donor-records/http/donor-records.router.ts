import type { Express } from 'express';
import { setSessionCookies } from '../../../shared/auth/session-cookies.js';
import { clientIpSubject } from '../../../shared/http/client-ip.js';
import { ApiError } from '../../../shared/http/errors.js';
import { sendData } from '../../../shared/http/respond.js';
import {
  guardsFor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage, type HttpSecrets,
} from '../../../shared/http/route-helpers.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import { isCanonicalUuid } from '../../../shared/validation/uuid.js';
import type { DonorRecordsService } from '../application/donor-records-service.js';
import type { ApproximateLocation } from '../domain/location.js';

export interface DonorRecordsRouterDependencies {
  readonly donors: DonorRecordsService;
  readonly secrets: HttpSecrets & Readonly<{ ipHmac: string }>;
}

/** Mensajes neutros: no revelan si ya existía una cuenta ni el estado interno. */
const REGISTRATION_NEUTRAL = 'Si el registro puede continuar, recibirás instrucciones.';
const REISSUE_NEUTRAL = 'Si la solicitud puede procesarse, la persona recibirá instrucciones.';
const EMAIL_CHANGED = 'Tu correo fue actualizado. Inicia sesión de nuevo.';

/** `format: uuid` admite `urn:uuid:…`; la base solo acepta la forma canónica, así que se rechaza aquí como 400. */
function canonicalSignupId(signupId: string): string {
  if (!isCanonicalUuid(signupId)) throw new ApiError('BAD_REQUEST');
  return signupId.toLowerCase();
}

/**
 * Donantes y altas asistidas (F5). Las rutas con token son públicas: la autorización es el propio secreto, que nunca se
 * registra. El hospital sale de la membresía y el rol de la sesión, jamás de la petición (ADR-003).
 */
export function registerDonorRecordsRoutes(app: Express, { donors, secrets }: DonorRecordsRouterDependencies): void {
  const guards = guardsFor(secrets);
  const register = compileOperation('createDonorRegistration');
  const previewVerification = compileOperation('getDonorEmailVerificationPreview');
  const verifyEmail = compileOperation('verifyDonorEmail');
  const previewActivation = compileOperation('getAssistedActivationPreview');
  const claim = compileOperation('claimAssistedRegistration');
  const previewChange = compileOperation('getEmailChangePreview');
  const verifyChange = compileOperation('verifyEmailChange');
  const createSignup = compileOperation('createAssistedSignup');
  const listSignups = compileOperation('listOwnAssistedSignups');
  const getSignup = compileOperation('getOwnAssistedSignup');
  const reissue = compileOperation('reissueAssistedActivationLink');
  const getProfile = compileOperation('getOwnDonorProfile');
  const onboarding = compileOperation('completeDonorOnboarding');
  const participation = compileOperation('updateOwnDonorParticipation');
  const token = (res: Parameters<typeof requirePrincipal>[0]) => requirePrincipal(res).accessToken;
  const ipOf = (req: Parameters<typeof clientIpSubject>[0]) => clientIpSubject(req, secrets.ipHmac);

  // --- Rutas públicas por token ---------------------------------------------------------------------------------

  app.post('/api/v1/donor-registrations', async (req, res) => {
    noQuery(register, req);
    const key = requireIdempotencyKey(req);
    const { email, password } = parse<{ email: string; password: string }>(register, 'body', req);
    await donors.registerDonor(email, password, key, ipOf(req));
    sendData(res, 202, ok(register, { message: REGISTRATION_NEUTRAL }));
  });

  app.get('/api/v1/donor-email-verification-actions/:token', async (req, res) => {
    noQuery(previewVerification, req);
    const { token: secret } = parse<{ token: string }>(previewVerification, 'params', req);
    sendData(res, 200, ok(previewVerification, await donors.previewEmailVerification(secret)));
  });

  app.post('/api/v1/donor-email-verification-actions/:token', async (req, res) => {
    noQuery(verifyEmail, req);
    const { token: secret } = parse<{ token: string }>(verifyEmail, 'params', req);
    requireIdempotencyKey(req);
    const outcome = await donors.verifyEmail(secret, ipOf(req));
    sendData(res, 200, ok(verifyEmail, outcome));
  });

  app.get('/api/v1/assisted-activation-actions/:token', async (req, res) => {
    noQuery(previewActivation, req);
    const { token: secret } = parse<{ token: string }>(previewActivation, 'params', req);
    sendData(res, 200, ok(previewActivation, await donors.previewAssistedActivation(secret)));
  });

  app.post('/api/v1/assisted-activation-actions/:token/claim', async (req, res) => {
    noQuery(claim, req);
    const { token: secret } = parse<{ token: string }>(claim, 'params', req);
    requireIdempotencyKey(req);
    const { password } = parse<{ password: string }>(claim, 'body', req);
    const { tokens, outcome } = await donors.claimAssisted(secret, password, ipOf(req));
    // Validar la salida ANTES de emitir cookies: un 500 no debe entregar una sesión.
    const data = ok(claim, outcome);
    setSessionCookies(res, tokens);
    sendData(res, 201, data);
  });

  app.get('/api/v1/donor-email-change-actions/:token', async (req, res) => {
    noQuery(previewChange, req);
    const { token: secret } = parse<{ token: string }>(previewChange, 'params', req);
    sendData(res, 200, ok(previewChange, await donors.previewEmailChange(secret)));
  });

  app.post('/api/v1/donor-email-change-actions/:token', async (req, res) => {
    noQuery(verifyChange, req);
    const { token: secret } = parse<{ token: string }>(verifyChange, 'params', req);
    requireIdempotencyKey(req);
    await donors.verifyEmailChange(secret, ipOf(req));
    sendData(res, 200, ok(verifyChange, { message: EMAIL_CHANGED }));
  });

  // --- Altas asistidas del hospital del admin (AAL2 y membresía vigente) -------------------------------------------

  app.get('/api/v1/hospitals/me/assisted-signups', ...guards.adminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listSignups, 'query', req);
    const cursor = readCursor(res, 'listOwnAssistedSignups', query, secrets.cursor);
    respondPage(listSignups, 'listOwnAssistedSignups',
      await donors.listAssistedSignups(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.post('/api/v1/hospitals/me/assisted-signups', ...guards.adminWrite, async (req, res) => {
    noQuery(createSignup, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ email: string; name?: string }>(createSignup, 'body', req);
    const principal = requirePrincipal(res);
    if (principal.hospital === null) throw new ApiError('ACCESS_DENIED');
    sendData(res, 202, ok(createSignup, await donors.createAssistedSignup(principal.accessToken, principal.hospital, key, body)));
  });

  app.get('/api/v1/hospitals/me/assisted-signups/:signupId', ...guards.adminRead, async (req, res) => {
    noQuery(getSignup, req);
    const { signupId } = parse<{ signupId: string }>(getSignup, 'params', req);
    sendData(res, 200, ok(getSignup, await donors.getAssistedSignup(token(res), canonicalSignupId(signupId))));
  });

  app.post('/api/v1/hospitals/me/assisted-signups/:signupId/activation-links', ...guards.adminWrite, async (req, res) => {
    noQuery(reissue, req);
    const { signupId } = parse<{ signupId: string }>(reissue, 'params', req);
    const id = canonicalSignupId(signupId);
    const key = requireIdempotencyKey(req);
    const principal = requirePrincipal(res);
    if (principal.hospital === null) throw new ApiError('ACCESS_DENIED');
    await donors.reissueAssistedLink(principal.accessToken, principal.hospital, key, id);
    sendData(res, 202, ok(reissue, { message: REISSUE_NEUTRAL }));
  });

  // --- Perfil propio del donante ----------------------------------------------------------------------------------

  app.get('/api/v1/donors/me/profile', ...guards.donorRead, async (req, res) => {
    noQuery(getProfile, req);
    sendData(res, 200, ok(getProfile, await donors.getProfile(token(res))));
  });

  app.put('/api/v1/donors/me/onboarding-profile', ...guards.donorWrite, async (req, res) => {
    noQuery(onboarding, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ name: string; declaredBloodType: string; isAvailable: boolean; approximateLocation: ApproximateLocation }>(onboarding, 'body', req);
    sendData(res, 200, ok(onboarding, await donors.completeOnboarding(token(res), key, body)));
  });

  app.patch('/api/v1/donors/me/profile', ...guards.donorWrite, async (req, res) => {
    noQuery(participation, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ isAvailable?: boolean; approximateLocation?: ApproximateLocation }>(participation, 'body', req);
    sendData(res, 200, ok(participation, await donors.updateParticipation(token(res), key, body)));
  });
}
