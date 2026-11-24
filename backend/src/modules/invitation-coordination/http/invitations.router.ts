import type { Express } from 'express';
import { clientIpSubject } from '../../../shared/http/client-ip.js';
import { hmacSha256Hex } from '../../../shared/crypto/hmac.js';
import { ApiError } from '../../../shared/http/errors.js';
import { sendData } from '../../../shared/http/respond.js';
import {
  guardsFor, nextCursor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage, type HttpSecrets,
} from '../../../shared/http/route-helpers.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import { isCanonicalUuid } from '../../../shared/validation/uuid.js';
import type { InvitationsService } from '../application/invitations-service.js';

export interface InvitationsRouterDependencies {
  readonly invitations: InvitationsService;
  readonly secrets: HttpSecrets & Readonly<{ ipHmac: string }>;
}

const RETRY_ACCEPTED = 'Si la solicitud puede procesarse, la persona recibirá instrucciones.';

/** `format: uuid` admite `urn:uuid:…`; la base solo acepta la forma canónica, así que se rechaza aquí como 400. */
function canonicalId(value: string): string {
  if (!isCanonicalUuid(value)) throw new ApiError('BAD_REQUEST');
  return value.toLowerCase();
}

type Query = { limit?: number; cursor?: string };

/**
 * Invitaciones (F6). Las rutas con token son públicas: la autorización es el propio secreto, que nunca se registra y viaja
 * en la ruta (se recibe por POST/GET con `no-store`). El hospital, el donante y el rol salen de la sesión, jamás de la petición.
 * El lote y el reintento orquestan dos pasos (autorizar con la sesión de la persona, ejecutar con la sesión técnica).
 */
export function registerInvitationsRoutes(app: Express, { invitations, secrets }: InvitationsRouterDependencies): void {
  const guards = guardsFor(secrets);
  const listBatches = compileOperation('listOwnInvitationBatches');
  const requestBatch = compileOperation('requestInvitationBatch');
  const coverage = compileOperation('getNeedCoverage');
  const listResponses = compileOperation('listOwnNeedResponses');
  const preview = compileOperation('getInvitationActionPreview');
  const respond = compileOperation('recordInitialInvitationResponse');
  const listOwn = compileOperation('listOwnInvitations');
  const getOwn = compileOperation('getOwnInvitation');
  const change = compileOperation('changeOwnInvitationResponse');
  const history = compileOperation('listOwnResponseHistory');
  const retry = compileOperation('retryInvitationDelivery');
  const token = (res: Parameters<typeof requirePrincipal>[0]) => requirePrincipal(res).accessToken;

  // --- Hospital -----------------------------------------------------------------------------------------------------

  app.get('/api/v1/hospitals/me/needs/:needId/invitation-batches', ...guards.adminRead, async (req, res) => {
    const { needId } = parse<{ needId: string }>(listBatches, 'params', req);
    const query = parse<Query>(listBatches, 'query', req);
    const cursor = readCursor(res, 'listOwnInvitationBatches', query, secrets.cursor);
    respondPage(listBatches, 'listOwnInvitationBatches', await invitations.listBatches(token(res), canonicalId(needId), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.post('/api/v1/hospitals/me/needs/:needId/invitation-batches', ...guards.adminWrite, async (req, res) => {
    noQuery(requestBatch, req);
    const { needId } = parse<{ needId: string }>(requestBatch, 'params', req);
    const id = canonicalId(needId);
    const key = requireIdempotencyKey(req);
    sendData(res, 201, ok(requestBatch, await invitations.requestBatch(token(res), key, id)));
  });

  app.get('/api/v1/hospitals/me/needs/:needId/coverage', ...guards.adminRead, async (req, res) => {
    noQuery(coverage, req);
    const { needId } = parse<{ needId: string }>(coverage, 'params', req);
    // Agregados de la cartera de donantes: no se guardan en cachés (el contrato ya declara no-store; sendData lo aplica a toda la API).
    res.setHeader('Cache-Control', 'no-store');
    const subject = hmacSha256Hex(secrets.ipHmac, `coverage:${requirePrincipal(res).userId}`);
    sendData(res, 200, ok(coverage, await invitations.getCoverage(token(res), canonicalId(needId), subject)));
  });

  app.get('/api/v1/hospitals/me/needs/:needId/responses', ...guards.adminRead, async (req, res) => {
    const { needId } = parse<{ needId: string }>(listResponses, 'params', req);
    const query = parse<Query>(listResponses, 'query', req);
    const cursor = readCursor(res, 'listOwnNeedResponses', query, secrets.cursor);
    const page = await invitations.listNeedResponses(token(res), canonicalId(needId), { limit: pageLimit(query), cursor });
    // Contiene nombres de donantes que confirmaron: no se guarda en cachés.
    res.setHeader('Cache-Control', 'no-store');
    sendData(res, 200, ok(listResponses, {
      confirmedIntentCount: page.confirmedIntentCount,
      items: page.items,
      pagination: { nextCursor: nextCursor(res, 'listOwnNeedResponses', page.next, secrets.cursor) },
    }));
  });

  // --- Rutas públicas por token ---------------------------------------------------------------------------------

  app.get('/api/v1/invitation-actions/:token', async (req, res) => {
    noQuery(preview, req);
    const { token: secret } = parse<{ token: string }>(preview, 'params', req);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    sendData(res, 200, ok(preview, await invitations.previewAction(secret, clientIpSubject(req, secrets.ipHmac))));
  });

  app.post('/api/v1/invitation-actions/:token/response', async (req, res) => {
    noQuery(respond, req);
    const { token: secret } = parse<{ token: string }>(respond, 'params', req);
    const key = requireIdempotencyKey(req);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    sendData(res, 200, ok(respond, await invitations.respondByToken(secret, key, clientIpSubject(req, secrets.ipHmac))));
  });

  // --- Donante ------------------------------------------------------------------------------------------------------

  app.get('/api/v1/donors/me/invitations', ...guards.donorRead, async (req, res) => {
    const query = parse<Query>(listOwn, 'query', req);
    const cursor = readCursor(res, 'listOwnInvitations', query, secrets.cursor);
    respondPage(listOwn, 'listOwnInvitations', await invitations.listOwn(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.get('/api/v1/donors/me/invitations/:invitationId', ...guards.donorRead, async (req, res) => {
    noQuery(getOwn, req);
    const { invitationId } = parse<{ invitationId: string }>(getOwn, 'params', req);
    sendData(res, 200, ok(getOwn, await invitations.getOwn(token(res), canonicalId(invitationId))));
  });

  app.patch('/api/v1/donors/me/invitations/:invitationId/response', ...guards.donorWrite, async (req, res) => {
    noQuery(change, req);
    const { invitationId } = parse<{ invitationId: string }>(change, 'params', req);
    const id = canonicalId(invitationId);
    const key = requireIdempotencyKey(req);
    const { response } = parse<{ response: 'confirmada' | 'rechazada' }>(change, 'body', req);
    sendData(res, 200, ok(change, await invitations.changeResponse(token(res), key, id, response)));
  });

  app.get('/api/v1/donors/me/responses', ...guards.donorRead, async (req, res) => {
    const query = parse<Query>(history, 'query', req);
    const cursor = readCursor(res, 'listOwnResponseHistory', query, secrets.cursor);
    respondPage(history, 'listOwnResponseHistory', await invitations.listHistory(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  // --- Superadmin ---------------------------------------------------------------------------------------------------

  app.post('/api/v1/superadmin/invitations/:invitationId/delivery-retries', ...guards.superadminStepUp, async (req, res) => {
    noQuery(retry, req);
    const { invitationId } = parse<{ invitationId: string }>(retry, 'params', req);
    const id = canonicalId(invitationId);
    const key = requireIdempotencyKey(req);
    await invitations.retryDelivery(token(res), key, id);
    sendData(res, 202, ok(retry, { message: RETRY_ACCEPTED }));
  });
}
