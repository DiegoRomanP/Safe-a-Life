import type { Express } from 'express';
import { ApiError } from '../../../shared/http/errors.js';
import { sendData } from '../../../shared/http/respond.js';
import {
  guardsFor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage, type HttpSecrets,
} from '../../../shared/http/route-helpers.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import { isCanonicalUuid } from '../../../shared/validation/uuid.js';
import type { PrivacyRequestsService } from '../application/privacy-requests-service.js';
import type { GrantAction, GrantField } from '../application/privacy-requests.ports.js';

export interface PrivacyRequestsRouterDependencies {
  readonly privacy: PrivacyRequestsService;
  readonly secrets: HttpSecrets;
}

/** `format: uuid` admite `urn:uuid:…`; la base solo acepta la forma canónica, así que se rechaza aquí como 400. */
function canonicalId(value: string): string {
  if (!isCanonicalUuid(value)) throw new ApiError('BAD_REQUEST');
  return value.toLowerCase();
}

/** Un grant que no es un UUID canónico no puede ser de nadie: se trata como ajeno (403), sin distinguir el motivo. */
function grantFrom(headers: unknown): string {
  const value = (headers as Record<string, string>)['X-Contextual-Grant'];
  if (typeof value !== 'string' || !isCanonicalUuid(value)) throw new ApiError('ACCESS_DENIED');
  return value.toLowerCase();
}

/**
 * Solicitudes de corrección y eliminación (F7). La persona, el rol y el donante salen de la sesión y de la solicitud, nunca
 * de la petición. El grant contextual viaja en `X-Contextual-Grant` y no se registra. La lectura de datos personales se
 * marca `no-store`.
 */
export function registerPrivacyRequestsRoutes(app: Express, { privacy, secrets }: PrivacyRequestsRouterDependencies): void {
  const guards = guardsFor(secrets);
  const listOwn = compileOperation('listOwnCorrectionRequests');
  const createOwn = compileOperation('createOwnCorrectionRequest');
  const getOwn = compileOperation('getOwnCorrectionRequest');
  const listAll = compileOperation('listCorrectionRequests');
  const getOne = compileOperation('getCorrectionRequest');
  const decide = compileOperation('decideCorrectionRequest');
  const grant = compileOperation('createContextualAccessGrant');
  const donorData = compileOperation('getContextualDonorData');
  const execute = compileOperation('executeApprovedCorrectionRequest');
  const token = (res: Parameters<typeof requirePrincipal>[0]) => requirePrincipal(res).accessToken;

  // --- Donante -----------------------------------------------------------------------------------------------------

  app.get('/api/v1/donors/me/correction-requests', ...guards.donorRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listOwn, 'query', req);
    const cursor = readCursor(res, 'listOwnCorrectionRequests', query, secrets.cursor);
    respondPage(listOwn, 'listOwnCorrectionRequests', await privacy.listOwn(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.post('/api/v1/donors/me/correction-requests', ...guards.donorWrite, async (req, res) => {
    noQuery(createOwn, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ type: 'correccion'; changes: { name?: string; newEmail?: string; declaredBloodType?: string } } | { type: 'eliminacion' }>(createOwn, 'body', req);
    sendData(res, 201, ok(createOwn, await privacy.createOwn(token(res), key, body)));
  });

  app.get('/api/v1/donors/me/correction-requests/:requestId', ...guards.donorRead, async (req, res) => {
    noQuery(getOwn, req);
    const { requestId } = parse<{ requestId: string }>(getOwn, 'params', req);
    sendData(res, 200, ok(getOwn, await privacy.getOwn(token(res), canonicalId(requestId))));
  });

  // --- Superadmin: solicitudes sin valores personales ---------------------------------------------------------------

  app.get('/api/v1/superadmin/correction-requests', ...guards.superadminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listAll, 'query', req);
    const cursor = readCursor(res, 'listCorrectionRequests', query, secrets.cursor);
    respondPage(listAll, 'listCorrectionRequests', await privacy.list(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.get('/api/v1/superadmin/correction-requests/:requestId', ...guards.superadminRead, async (req, res) => {
    noQuery(getOne, req);
    const { requestId } = parse<{ requestId: string }>(getOne, 'params', req);
    sendData(res, 200, ok(getOne, await privacy.get(token(res), canonicalId(requestId))));
  });

  app.patch('/api/v1/superadmin/correction-requests/:requestId', ...guards.superadminWrite, async (req, res) => {
    noQuery(decide, req);
    const { requestId } = parse<{ requestId: string }>(decide, 'params', req);
    const id = canonicalId(requestId);
    const key = requireIdempotencyKey(req);
    const { decision, reason } = parse<{ decision: 'aprobada' | 'rechazada'; reason: string }>(decide, 'body', req);
    sendData(res, 200, ok(decide, await privacy.decide(token(res), key, id, decision, reason)));
  });

  // --- Superadmin: grants, lectura contextual y ejecución -------------------------------------------------------------

  app.post('/api/v1/superadmin/access-grants', ...guards.superadminStepUp, async (req, res) => {
    noQuery(grant, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ requestId: string; action: GrantAction; allowedFields: GrantField[]; reason: string }>(grant, 'body', req);
    sendData(res, 201, ok(grant, await privacy.createGrant(token(res), key, { ...body, requestId: canonicalId(body.requestId) })));
  });

  app.get('/api/v1/superadmin/correction-requests/:requestId/donor-data', ...guards.superadminRead, async (req, res) => {
    noQuery(donorData, req);
    const { requestId } = parse<{ requestId: string }>(donorData, 'params', req);
    const id = canonicalId(requestId);
    const grantId = grantFrom(donorData.parseHeaders(req.headers as Record<string, unknown>));
    res.setHeader('Cache-Control', 'no-store');
    sendData(res, 200, ok(donorData, await privacy.contextualData(token(res), id, grantId)));
  });

  app.post('/api/v1/superadmin/correction-requests/:requestId/executions', ...guards.superadminStepUp, async (req, res) => {
    noQuery(execute, req);
    const { requestId } = parse<{ requestId: string }>(execute, 'params', req);
    const id = canonicalId(requestId);
    const key = requireIdempotencyKey(req);
    const grantId = grantFrom(execute.parseHeaders(req.headers as Record<string, unknown>));
    sendData(res, 200, ok(execute, await privacy.execute(token(res), key, id, grantId)));
  });
}
