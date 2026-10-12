import type { Express, Response } from 'express';
import { fingerprint } from '../../../shared/http/idempotency.js';
import { sendData } from '../../../shared/http/respond.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { compileOperation, type OperationValidator } from '../../../shared/validation/contract-validator.js';
import {
  guardsFor, nextCursor, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, type HttpSecrets,
} from './identity-http.js';

export interface InstitutionsRouterDependencies {
  readonly rpc: RpcInvoker;
  readonly secrets: HttpSecrets;
}


const ok = (validator: OperationValidator, data: unknown): unknown => (validator.assertSuccess({ data }) as { data: unknown }).data;
const nullable = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/**
 * Hospitales, sedes, membresías, configuración, auditoría y tareas del superadmin,
 * más las sedes propias del admin. Cada escritura envía a la RPC el hash canónico
 * que ella recalcula; los campos ausentes viajan como null (sin cambio).
 */
export function registerInstitutionsRoutes(app: Express, { rpc, secrets }: InstitutionsRouterDependencies): void {
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
  const at = (res: Response) => requirePrincipal(res).accessToken;

  // Paginación común: items + cursor opaco firmado y ligado al actor y la operación.
  const page = (validator: OperationValidator, operation: string, items: unknown, next: unknown, res: Response) =>
    ok(validator, { items, pagination: { nextCursor: nextCursor(res, operation, next, secrets.cursor) } });

  app.get('/api/v1/superadmin/hospitals', ...guards.superadminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listHospitals, 'query', req);
    const cursor = readCursor(res, 'listHospitals', query, secrets.cursor);
    const reply = await rpc({
      accessToken: at(res), name: 'list_hospitals', okKinds: ['ok'],
      args: { p_limit: pageLimit(query), p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
    });
    sendData(res, 200, page(listHospitals, 'listHospitals', reply.items, reply.next, res));
  });

  app.post('/api/v1/superadmin/hospitals', ...guards.superadminWrite, async (req, res) => {
    const key = requireIdempotencyKey(req);
    const body = parse<{ publicName: string; legalName: string }>(createHospital, 'body', req);
    const reply = await rpc({
      accessToken: at(res), name: 'create_hospital', okKinds: ['created'],
      args: {
        p_key: key,
        p_hash: fingerprint([['publicName', body.publicName], ['legalName', body.legalName]]),
        p_public_name: body.publicName, p_legal_name: body.legalName,
      },
    });
    sendData(res, 201, ok(createHospital, reply.hospital));
  });

  app.get('/api/v1/superadmin/hospitals/:hospitalId', ...guards.superadminRead, async (req, res) => {
    const { hospitalId } = parse<{ hospitalId: string }>(getHospital, 'params', req);
    const reply = await rpc({ accessToken: at(res), name: 'get_hospital', okKinds: ['ok'], args: { p_id: hospitalId } });
    sendData(res, 200, ok(getHospital, reply.hospital));
  });

  app.patch('/api/v1/superadmin/hospitals/:hospitalId', ...guards.superadminStepUp, async (req, res) => {
    const { hospitalId } = parse<{ hospitalId: string }>(updateHospital, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ publicName?: string; legalName?: string; isAuthorized?: boolean }>(updateHospital, 'body', req);
    const reply = await rpc({
      accessToken: at(res), name: 'update_hospital', okKinds: ['ok'],
      args: {
        p_key: key,
        p_hash: fingerprint([['hospitalId', hospitalId], ['publicName', nullable(body.publicName)],
          ['legalName', nullable(body.legalName)], ['isAuthorized', nullable(body.isAuthorized)]]),
        p_id: hospitalId, p_public_name: nullable(body.publicName), p_legal_name: nullable(body.legalName),
        p_is_authorized: nullable(body.isAuthorized),
      },
    });
    sendData(res, 200, ok(updateHospital, reply.hospital));
  });

  app.get('/api/v1/superadmin/hospitals/:hospitalId/sites', ...guards.superadminRead, async (req, res) => {
    const { hospitalId } = parse<{ hospitalId: string }>(listHospitalSites, 'params', req);
    const reply = await rpc({ accessToken: at(res), name: 'list_hospital_sites', okKinds: ['ok'], args: { p_hospital_id: hospitalId } });
    sendData(res, 200, ok(listHospitalSites, { items: reply.items }));
  });

  app.post('/api/v1/superadmin/hospitals/:hospitalId/sites', ...guards.superadminWrite, async (req, res) => {
    const { hospitalId } = parse<{ hospitalId: string }>(createHospitalSite, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{
      publicName: string; publicAddress: string; coordinates: { latitude: number; longitude: number }; publicInstructions?: string;
    }>(createHospitalSite, 'body', req);
    const latitude = String(body.coordinates.latitude);
    const longitude = String(body.coordinates.longitude);
    const reply = await rpc({
      accessToken: at(res), name: 'create_hospital_site', okKinds: ['created'],
      args: {
        p_key: key,
        p_hash: fingerprint([['hospitalId', hospitalId], ['publicName', body.publicName], ['publicAddress', body.publicAddress],
          ['latitude', latitude], ['longitude', longitude], ['publicInstructions', nullable(body.publicInstructions)]]),
        p_hospital_id: hospitalId, p_public_name: body.publicName, p_public_address: body.publicAddress,
        p_latitude: body.coordinates.latitude, p_longitude: body.coordinates.longitude,
        p_public_instructions: nullable(body.publicInstructions),
      },
    });
    sendData(res, 201, ok(createHospitalSite, reply.site));
  });

  app.patch('/api/v1/superadmin/sites/:siteId', ...guards.superadminWrite, async (req, res) => {
    const { siteId } = parse<{ siteId: string }>(updateHospitalSite, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{
      publicName?: string; publicAddress?: string; coordinates?: { latitude: number; longitude: number };
      publicInstructions?: string; isActive?: boolean; isApproved?: boolean;
    }>(updateHospitalSite, 'body', req);
    const latitude = body.coordinates ? body.coordinates.latitude : null;
    const longitude = body.coordinates ? body.coordinates.longitude : null;
    const reply = await rpc({
      accessToken: at(res), name: 'update_hospital_site', okKinds: ['ok'],
      args: {
        p_key: key,
        p_hash: fingerprint([['siteId', siteId], ['publicName', nullable(body.publicName)],
          ['publicAddress', nullable(body.publicAddress)], ['latitude', latitude === null ? null : String(latitude)],
          ['longitude', longitude === null ? null : String(longitude)], ['publicInstructions', nullable(body.publicInstructions)],
          ['isActive', nullable(body.isActive)], ['isApproved', nullable(body.isApproved)]]),
        p_site_id: siteId, p_public_name: nullable(body.publicName), p_public_address: nullable(body.publicAddress),
        p_latitude: latitude, p_longitude: longitude, p_public_instructions: nullable(body.publicInstructions),
        p_is_active: nullable(body.isActive), p_is_approved: nullable(body.isApproved),
      },
    });
    sendData(res, 200, ok(updateHospitalSite, reply.site));
  });

  app.get('/api/v1/superadmin/memberships', ...guards.superadminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listMemberships, 'query', req);
    const cursor = readCursor(res, 'listHospitalMemberships', query, secrets.cursor);
    const reply = await rpc({
      accessToken: at(res), name: 'list_memberships', okKinds: ['ok'],
      args: { p_limit: pageLimit(query), p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
    });
    sendData(res, 200, page(listMemberships, 'listHospitalMemberships', reply.items, reply.next, res));
  });

  app.patch('/api/v1/superadmin/memberships/:membershipId', ...guards.superadminWrite, async (req, res) => {
    const { membershipId } = parse<{ membershipId: string }>(revokeMembership, 'params', req);
    const key = requireIdempotencyKey(req);
    const body = parse<{ status: 'revocada'; reason: string }>(revokeMembership, 'body', req);
    const reply = await rpc({
      accessToken: at(res), name: 'revoke_membership', okKinds: ['ok'],
      args: {
        p_key: key,
        p_hash: fingerprint([['membershipId', membershipId], ['status', body.status], ['reason', body.reason]]),
        p_id: membershipId, p_reason: body.reason,
      },
    });
    sendData(res, 200, ok(revokeMembership, reply.membership));
  });

  app.get('/api/v1/superadmin/configuration', ...guards.superadminRead, async (req, res) => {
    getConfiguration.parseQuery(req.query as Record<string, unknown>);
    const reply = await rpc({ accessToken: at(res), name: 'get_configuration', okKinds: ['ok'], args: {} });
    sendData(res, 200, ok(getConfiguration, { finalDemoAt: reply.finalDemoAt, isImmutable: reply.isImmutable }));
  });

  app.patch('/api/v1/superadmin/configuration', ...guards.superadminStepUp, async (req, res) => {
    const key = requireIdempotencyKey(req);
    const body = parse<{ finalDemoAt: string }>(setFinalDemoAt, 'body', req);
    const at_ = new Date(body.finalDemoAt).toISOString();
    const reply = await rpc({
      accessToken: at(res), name: 'set_final_demo_at', okKinds: ['ok'],
      args: { p_key: key, p_hash: fingerprint([['finalDemoAt', at_]]), p_at: at_ },
    });
    sendData(res, 200, ok(setFinalDemoAt, { finalDemoAt: reply.finalDemoAt, isImmutable: reply.isImmutable }));
  });

  app.get('/api/v1/superadmin/audit-events', ...guards.superadminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listAuditEvents, 'query', req);
    const cursor = readCursor(res, 'listAuditEvents', query, secrets.cursor);
    const reply = await rpc({
      accessToken: at(res), name: 'list_audit_events', okKinds: ['ok'],
      args: { p_limit: pageLimit(query), p_cursor_occurred_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
    });
    sendData(res, 200, page(listAuditEvents, 'listAuditEvents', reply.items, reply.next, res));
  });

  app.get('/api/v1/superadmin/task-queue', ...guards.superadminRead, async (req, res) => {
    listTasks.parseQuery(req.query as Record<string, unknown>);
    const reply = await rpc({ accessToken: at(res), name: 'list_superadmin_tasks', okKinds: ['ok'], args: {} });
    sendData(res, 200, ok(listTasks, { items: reply.items }));
  });

  app.get('/api/v1/hospitals/me/sites', ...guards.adminRead, async (req, res) => {
    const query = parse<{ limit?: number; cursor?: string }>(listOwnSites, 'query', req);
    const cursor = readCursor(res, 'listOwnHospitalSites', query, secrets.cursor);
    const reply = await rpc({
      accessToken: at(res), name: 'list_own_hospital_sites', okKinds: ['ok'],
      args: { p_limit: pageLimit(query), p_cursor_site_id: cursor?.id ?? null },
    });
    const next = reply.next === null || reply.next === undefined ? null : { id: reply.next as string };
    sendData(res, 200, page(listOwnSites, 'listOwnHospitalSites', reply.items, next, res));
  });
}

