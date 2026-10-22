import type { Express, Response } from 'express';
import { sendData } from '../../../shared/http/respond.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';
import type { InstitutionsService } from '../application/institutions-service.js';
import {
  guardsFor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage, type HttpSecrets,
} from './identity-http.js';

export interface InstitutionsRouterDependencies {
  readonly institutions: InstitutionsService;
  readonly secrets: HttpSecrets;
}

type PageQueryParams = { limit?: number; cursor?: string };

/**
 * Hospitales, sedes, membresías, configuración, auditoría y tareas del superadmin, más las sedes
 * propias del admin. El router solo parsea la petición contra el contrato, aplica los guards y
 * serializa; la lógica vive en el servicio y la persistencia en el puerto (ADR-003).
 */
export function registerInstitutionsRoutes(app: Express, { institutions, secrets }: InstitutionsRouterDependencies): void {
  const guards = guardsFor(secrets);
  const op = (id: string) => compileOperation(id);
  const listHospitals = op('listHospitals');
  const createHospital = op('createHospital');
  const getHospital = op('getHospital');
  const updateHospital = op('updateHospital');
  const listHospitalSites = op('listHospitalSites');
  const createHospitalSite = op('createHospitalSite');
  const updateHospitalSite = op('updateHospitalSite');
  const listMemberships = op('listHospitalMemberships');
  const revokeMembership = op('revokeHospitalMembership');
  const getConfiguration = op('getSuperadminConfiguration');
  const setFinalDemoAt = op('setFinalDemoAt');
  const listAuditEvents = op('listAuditEvents');
  const listTasks = op('listSuperadminTasks');
  const listOwnSites = op('listOwnHospitalSites');
  const token = (res: Response) => requirePrincipal(res).accessToken;

  app.get('/api/v1/superadmin/hospitals', ...guards.superadminRead, async (req, res) => {
    const query = parse<PageQueryParams>(listHospitals, 'query', req);
    const cursor = readCursor(res, 'listHospitals', query, secrets.cursor);
    respondPage(listHospitals, 'listHospitals', await institutions.listHospitals(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.post('/api/v1/superadmin/hospitals', ...guards.superadminWrite, async (req, res) => {
    noQuery(createHospital, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ publicName: string; legalName: string }>(createHospital, 'body', req);
    sendData(res, 201, ok(createHospital, await institutions.createHospital(token(res), key, body)));
  });

  app.get('/api/v1/superadmin/hospitals/:hospitalId', ...guards.superadminRead, async (req, res) => {
    noQuery(getHospital, req);
    const { hospitalId } = parse<{ hospitalId: string }>(getHospital, 'params', req);
    sendData(res, 200, ok(getHospital, await institutions.getHospital(token(res), hospitalId)));
  });

  app.patch('/api/v1/superadmin/hospitals/:hospitalId', ...guards.superadminStepUp, async (req, res) => {
    noQuery(updateHospital, req);
    const { hospitalId } = parse<{ hospitalId: string }>(updateHospital, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ publicName?: string; legalName?: string; isAuthorized?: boolean }>(updateHospital, 'body', req);
    sendData(res, 200, ok(updateHospital, await institutions.updateHospital(token(res), key, hospitalId, body)));
  });

  app.get('/api/v1/superadmin/hospitals/:hospitalId/sites', ...guards.superadminRead, async (req, res) => {
    noQuery(listHospitalSites, req);
    const { hospitalId } = parse<{ hospitalId: string }>(listHospitalSites, 'params', req);
    sendData(res, 200, ok(listHospitalSites, { items: await institutions.listHospitalSites(token(res), hospitalId) }));
  });

  app.post('/api/v1/superadmin/hospitals/:hospitalId/sites', ...guards.superadminWrite, async (req, res) => {
    noQuery(createHospitalSite, req);
    const { hospitalId } = parse<{ hospitalId: string }>(createHospitalSite, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<Parameters<InstitutionsService['createHospitalSite']>[3]>(createHospitalSite, 'body', req);
    sendData(res, 201, ok(createHospitalSite, await institutions.createHospitalSite(token(res), key, hospitalId, body)));
  });

  app.patch('/api/v1/superadmin/sites/:siteId', ...guards.superadminWrite, async (req, res) => {
    noQuery(updateHospitalSite, req);
    const { siteId } = parse<{ siteId: string }>(updateHospitalSite, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<Parameters<InstitutionsService['updateHospitalSite']>[3]>(updateHospitalSite, 'body', req);
    sendData(res, 200, ok(updateHospitalSite, await institutions.updateHospitalSite(token(res), key, siteId, body)));
  });

  app.get('/api/v1/superadmin/memberships', ...guards.superadminRead, async (req, res) => {
    const query = parse<PageQueryParams>(listMemberships, 'query', req);
    const cursor = readCursor(res, 'listHospitalMemberships', query, secrets.cursor);
    respondPage(listMemberships, 'listHospitalMemberships', await institutions.listMemberships(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  // RNF-SEC-05: cambiar membresías exige step-up.
  app.patch('/api/v1/superadmin/memberships/:membershipId', ...guards.superadminStepUp, async (req, res) => {
    noQuery(revokeMembership, req);
    const { membershipId } = parse<{ membershipId: string }>(revokeMembership, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ status: 'revocada'; reason: string }>(revokeMembership, 'body', req);
    sendData(res, 200, ok(revokeMembership, await institutions.revokeMembership(token(res), key, membershipId, body.reason)));
  });

  app.get('/api/v1/superadmin/configuration', ...guards.superadminRead, async (req, res) => {
    noQuery(getConfiguration, req);
    sendData(res, 200, ok(getConfiguration, await institutions.getConfiguration(token(res))));
  });

  app.patch('/api/v1/superadmin/configuration', ...guards.superadminStepUp, async (req, res) => {
    noQuery(setFinalDemoAt, req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ finalDemoAt: string }>(setFinalDemoAt, 'body', req);
    sendData(res, 200, ok(setFinalDemoAt, await institutions.setFinalDemoAt(token(res), key, body.finalDemoAt)));
  });

  app.get('/api/v1/superadmin/audit-events', ...guards.superadminRead, async (req, res) => {
    const query = parse<PageQueryParams>(listAuditEvents, 'query', req);
    const cursor = readCursor(res, 'listAuditEvents', query, secrets.cursor);
    respondPage(listAuditEvents, 'listAuditEvents', await institutions.listAuditEvents(token(res), { limit: pageLimit(query), cursor }), res, secrets.cursor);
  });

  app.get('/api/v1/superadmin/task-queue', ...guards.superadminRead, async (req, res) => {
    noQuery(listTasks, req);
    sendData(res, 200, ok(listTasks, { items: await institutions.listTasks(token(res)) }));
  });

  app.get('/api/v1/hospitals/me/sites', ...guards.adminRead, async (req, res) => {
    const query = parse<PageQueryParams>(listOwnSites, 'query', req);
    const cursor = readCursor(res, 'listOwnHospitalSites', query, secrets.cursor);
    respondPage(listOwnSites, 'listOwnHospitalSites',
      await institutions.listOwnSites(token(res), { limit: pageLimit(query), afterSiteId: cursor?.id ?? null }), res, secrets.cursor);
  });
}
