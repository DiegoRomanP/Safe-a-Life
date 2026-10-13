import type { Express } from 'express';
import type { Principal } from '../../../shared/auth/principal.js';
import { ApiError } from '../../../shared/http/errors.js';
import {
  guardsFor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage, type HttpSecrets,
} from '../../../shared/http/route-helpers.js';
import { sendData } from '../../../shared/http/respond.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import type { CreateNeedDraft } from '../application/create-need-draft.js';
import type { CreateNeedDraftContext } from '../application/create-need-draft.ports.js';
import type { NeedsService } from '../application/needs-service.js';
import type { ManualNeedStatus, NeedStatus } from '../domain/need-state.js';

const PLAIN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `format: uuid` admite `urn:uuid:…`; la base solo acepta la forma canónica, así que se rechaza aquí como 400. */
function plainNeedId(needId: string): string {
  if (!PLAIN_UUID.test(needId)) throw new ApiError('BAD_REQUEST');
  return needId;
}

export interface NeedsRouterDependencies {
  readonly needs: NeedsService;
  /** Servicio de creación ligado al JWT del actor de la petición (nunca un cliente global). */
  readonly createDraft: (accessToken: string) => CreateNeedDraft;
  readonly secrets: HttpSecrets;
}

/** Instantánea de identidad y membresía que el caso de uso revalida; la RPC la deriva otra vez en SQL. */
function contextOf(principal: Principal): CreateNeedDraftContext {
  return {
    principal: {
      actorId: principal.userId,
      role: principal.role,
      aal: principal.aal,
      membership: principal.hospital === null
        ? null
        : { hospitalId: principal.hospital.hospitalId, isActive: principal.hospital.membershipActive, hospitalIsActive: principal.hospital.hospitalAuthorized },
    },
  };
}

/**
 * Necesidades del hospital del actor. El router solo parsea contra el contrato, aplica los guards y
 * serializa; el hospital sale de la membresía en SQL y nunca de la petición (ADR-003).
 */
export function registerNeedsRoutes(app: Express, { needs, createDraft, secrets }: NeedsRouterDependencies): void {
  const guards = guardsFor(secrets);
  const createNeed = compileOperation('createHospitalNeed');
  const listNeeds = compileOperation('listOwnHospitalNeeds');
  const getNeed = compileOperation('getOwnHospitalNeed');
  const transitionNeed = compileOperation('transitionOwnHospitalNeed');
  const token = (res: Parameters<typeof requirePrincipal>[0]) => requirePrincipal(res).accessToken;

  app.post('/api/v1/hospitals/me/needs', ...guards.adminWrite, async (req, res) => {
    noQuery(createNeed, req);
    const principal = requirePrincipal(res);
    const result = await createDraft(principal.accessToken)(req.body, contextOf(principal), { key: req.get('idempotency-key') });
    if (!result.ok) throw new ApiError(result.code);
    sendData(res, 201, ok(createNeed, result.need));
  });

  app.get('/api/v1/hospitals/me/needs', ...guards.adminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string; status?: NeedStatus }>(listNeeds, 'query', req);
    const cursor = readCursor(res, 'listOwnHospitalNeeds', query, secrets.cursor);
    respondPage(listNeeds, 'listOwnHospitalNeeds',
      await needs.list(token(res), { limit: pageLimit(query), cursor, status: query.status ?? null }), res, secrets.cursor);
  });

  app.get('/api/v1/hospitals/me/needs/:needId', ...guards.adminRead, async (req, res) => {
    noQuery(getNeed, req);
    const { needId } = parse<{ needId: string }>(getNeed, 'params', req);
    sendData(res, 200, ok(getNeed, await needs.get(token(res), plainNeedId(needId))));
  });

  app.patch('/api/v1/hospitals/me/needs/:needId', ...guards.adminWrite, async (req, res) => {
    noQuery(transitionNeed, req);
    const { needId } = parse<{ needId: string }>(transitionNeed, 'params', req);
    plainNeedId(needId);
    const key = requireIdempotencyKey(req);
    const body = parse<{ status: ManualNeedStatus }>(transitionNeed, 'body', req);
    sendData(res, 200, ok(transitionNeed, await needs.transition(token(res), key, needId, body.status)));
  });
}
