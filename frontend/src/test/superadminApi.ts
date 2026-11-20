import { act } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { clearAuthSession, logout } from '../features/auth/session/session.js';
import type { AdminCorrectionRequest, AuditEvent, Hospital, Membership, Site, SuperadminConfiguration, SuperadminTask } from '../features/superadmin/types.js';
import { TEST_DONOR_SESSION } from './renderRoute.js';
import {
  demoAuditEvents,
  demoConfiguration,
  demoDonorData,
  demoHospitals,
  demoMemberships,
  demoRequests,
  demoSites,
  demoTasks,
} from './superadminFixtures.js';

export type SuperadminApiStub = {
  hospitals: Hospital[];
  sites: Site[];
  memberships: Membership[];
  requests: AdminCorrectionRequest[];
  configuration: SuperadminConfiguration;
  auditEvents: AuditEvent[];
  tasks: SuperadminTask[];
  /** «MÉTODO ruta» de cada petición, en orden. */
  requests_: string[];
  /** Cabecera X-Contextual-Grant recibida en la última lectura/ejecución. */
  lastGrantHeader: string | null;
  /** Hasta cuándo vale el step-up del «backend» (ms); 0 = nunca verificado. */
  stepUpUntil: number;
  /** Si no es null, todas las lecturas responden con ese estado (p. ej. 503). */
  readStatus: number | null;
  /** Si no es null, las escrituras responden con ese estado (p. ej. 409). */
  writeStatus: number | null;
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const error = (status: number, code = 'X') => reply(status, { error: { code, message: 'x', correlationId: 'c' } });
const code = (prefix: string, id: string) => `${prefix}-${id.slice(0, 4).toUpperCase()}`;
const page = <T,>(items: T[]) => reply(200, { data: { items, pagination: { nextCursor: null } } });

// Operaciones que el backend protege con step-up (docs/openapi.json).
const STEP_UP_ROUTES = [
  /^PATCH \/superadmin\/hospitals\//,
  /^PATCH \/superadmin\/memberships\//,
  /^POST \/superadmin\/hospital-admin-invitations/,
  /^PATCH \/superadmin\/configuration/,
  /^POST \/superadmin\/access-grants/,
  /\/executions$/,
];

/** Sustituye `fetch` por un backend en memoria de las operaciones del superadmin, con step-up, grants y CSRF como el real. */
export function stubSuperadminApi(): SuperadminApiStub {
  const stub: SuperadminApiStub = {
    hospitals: structuredClone(demoHospitals),
    sites: structuredClone(demoSites),
    memberships: structuredClone(demoMemberships),
    requests: structuredClone(demoRequests),
    configuration: structuredClone(demoConfiguration),
    auditEvents: structuredClone(demoAuditEvents),
    tasks: structuredClone(demoTasks),
    requests_: [],
    lastGrantHeader: null,
    stepUpUntil: 0,
    readStatus: null,
    writeStatus: null,
  };
  const grants = new Map<string, { requestId: string; action: string }>();
  const audit = (event: string, resourceCode: string, reason?: string) =>
    stub.auditEvents.unshift({ eventId: crypto.randomUUID(), actorCode: 'ACT-SA01', event, resourceCode, result: 'ok', occurredAt: new Date().toISOString(), ...(reason ? { reason } : {}) });
  const closeTask = (resourceCode: string) => { stub.tasks = stub.tasks.filter((task) => task.resourceCode !== resourceCode); };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace('/api/v1', '').split('?')[0]!;
    const key = `${method} ${url}`;
    stub.requests_.push(key);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (key === 'POST /auth/step-up-verifications') {
      if (body.code === '000000') return error(401, 'AUTHENTICATION_REQUIRED');
      stub.stepUpUntil = Date.now() + 5 * 60_000;
      return reply(200, { data: { verifiedUntil: new Date(stub.stepUpUntil).toISOString() } });
    }

    if (method === 'GET') {
      if (stub.readStatus) return error(stub.readStatus);
      if (url === '/superadmin/task-queue') return reply(200, { data: { items: stub.tasks } });
      if (url === '/superadmin/hospitals') return page(stub.hospitals);
      if (url === '/superadmin/memberships') return page(stub.memberships);
      if (url === '/superadmin/audit-events') return page(stub.auditEvents);
      if (url === '/superadmin/correction-requests') return page(stub.requests);
      if (url === '/superadmin/configuration') return reply(200, { data: stub.configuration });
      const sites = /^\/superadmin\/hospitals\/([^/]+)\/sites$/.exec(url);
      if (sites) return reply(200, { data: { items: stub.sites.filter((site) => site.hospitalId === sites[1]) } });
      const donor = /^\/superadmin\/correction-requests\/([^/]+)\/donor-data$/.exec(url);
      if (donor) {
        stub.lastGrantHeader = headers.get('x-contextual-grant');
        const grant = stub.lastGrantHeader ? grants.get(stub.lastGrantHeader) : undefined;
        if (!grant || grant.requestId !== donor[1] || grant.action !== 'review') return error(404, 'NOT_FOUND');
        return reply(200, { data: demoDonorData[donor[1]!] });
      }
      return error(404, 'NOT_FOUND');
    }

    // Como el backend: CSRF de la sesión, luego step-up, luego la operación.
    if (headers.get('x-csrf-token') !== TEST_DONOR_SESSION.csrfToken) return error(403, 'CSRF_INVALID');
    if (STEP_UP_ROUTES.some((route) => route.test(key)) && Date.now() >= stub.stepUpUntil) return error(403, 'STEP_UP_REQUIRED');
    if (stub.writeStatus) return error(stub.writeStatus);

    if (key === 'POST /superadmin/hospitals') {
      const created: Hospital = { hospitalId: crypto.randomUUID(), ...body, isAuthorized: false, createdAt: new Date().toISOString() };
      stub.hospitals.push(created);
      audit('hospital.creado', code('HOS', created.hospitalId));
      return reply(201, { data: created });
    }
    const hospital = /^PATCH \/superadmin\/hospitals\/([^/]+)$/.exec(key);
    if (hospital) {
      const target = stub.hospitals.find((item) => item.hospitalId === hospital[1]);
      if (!target) return error(404, 'NOT_FOUND');
      Object.assign(target, body);
      audit(body.isAuthorized ? 'hospital.autorizado' : 'hospital.desautorizado', code('HOS', target.hospitalId));
      return reply(200, { data: target });
    }
    const newSite = /^POST \/superadmin\/hospitals\/([^/]+)\/sites$/.exec(key);
    if (newSite) {
      const created: Site = { siteId: crypto.randomUUID(), hospitalId: newSite[1]!, ...body, publicInstructions: null, isActive: false, isApproved: false };
      stub.sites.push(created);
      audit('sede.creada', code('SED', created.siteId));
      return reply(201, { data: created });
    }
    const site = /^PATCH \/superadmin\/sites\/([^/]+)$/.exec(key);
    if (site) {
      const target = stub.sites.find((item) => item.siteId === site[1]);
      if (!target) return error(404, 'NOT_FOUND');
      Object.assign(target, body);
      closeTask(code('SED', target.siteId));
      audit('sede.aprobada', code('SED', target.siteId));
      return reply(200, { data: target });
    }
    if (key === 'POST /superadmin/hospital-admin-invitations') {
      const membership: Membership = { membershipId: crypto.randomUUID(), hospitalId: body.hospitalId, role: 'admin_hospitalario', status: 'pendiente', emailHint: `${String(body.email).slice(0, 1)}***@${String(body.email).split('@')[1]}` };
      stub.memberships.push(membership);
      audit('admin.invitado', code('MEM', membership.membershipId));
      return reply(202, { data: { message: 'Si la solicitud puede procesarse, recibirás instrucciones.' } });
    }
    const membership = /^PATCH \/superadmin\/memberships\/([^/]+)$/.exec(key);
    if (membership) {
      const target = stub.memberships.find((item) => item.membershipId === membership[1]);
      if (!target) return error(404, 'NOT_FOUND');
      // Cuerpo de revokeHospitalMembership: status const y motivo obligatorio.
      if (body.status !== 'revocada' || typeof body.reason !== 'string' || !body.reason) return error(422, 'VALIDATION_ERROR');
      target.status = 'revocada';
      audit('membresia.revocada', code('MEM', target.membershipId), body.reason);
      return reply(200, { data: target });
    }
    const decision = /^PATCH \/superadmin\/correction-requests\/([^/]+)$/.exec(key);
    if (decision) {
      const target = stub.requests.find((item) => item.requestId === decision[1]);
      if (!target) return error(404, 'NOT_FOUND');
      Object.assign(target, { status: body.decision, decisionReason: body.reason, updatedAt: new Date().toISOString() });
      closeTask(code('SOL', target.requestId));
      audit(body.decision === 'aprobada' ? 'solicitud.aprobada' : 'solicitud.rechazada', code('SOL', target.requestId), body.reason);
      return reply(200, { data: target });
    }
    if (key === 'POST /superadmin/access-grants') {
      const grantId = crypto.randomUUID();
      grants.set(grantId, { requestId: body.requestId, action: body.action });
      audit(body.action === 'review' ? 'acceso.contextual.revision' : 'acceso.contextual.ejecucion', code('SOL', body.requestId), body.reason);
      return reply(201, { data: { grantId, requestId: body.requestId, action: body.action, allowedFields: body.allowedFields, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() } });
    }
    const execution = /^POST \/superadmin\/correction-requests\/([^/]+)\/executions$/.exec(key);
    if (execution) {
      stub.lastGrantHeader = headers.get('x-contextual-grant');
      const grant = stub.lastGrantHeader ? grants.get(stub.lastGrantHeader) : undefined;
      const target = stub.requests.find((item) => item.requestId === execution[1]);
      if (!grant || grant.action !== 'execute' || !target) return error(404, 'NOT_FOUND');
      if (target.status !== 'aprobada') return error(409, 'STATE_CONFLICT');
      target.status = 'completada';
      audit('solicitud.ejecutada', code('SOL', target.requestId));
      return reply(200, { data: target });
    }
    if (key === 'PATCH /superadmin/configuration') {
      if (stub.configuration.isImmutable) return error(409, 'STATE_CONFLICT');
      stub.configuration = { finalDemoAt: body.finalDemoAt, isImmutable: true };
      audit('configuracion.fecha_final', 'CFG-DEMO');
      return reply(200, { data: stub.configuration });
    }
    return error(404, 'NOT_FOUND');
  });
  return stub;
}

/** Registra el ciclo de una prueba con el backend del superadmin: uno nuevo por prueba y la sesión vuelve a reposo al terminar. */
export function registerSuperadminApi(): () => SuperadminApiStub {
  let api!: SuperadminApiStub;
  beforeEach(() => { api = stubSuperadminApi(); });
  // Un 401 o expireSession deja la sesión «expirada» a nivel de módulo: logout sin sesión la devuelve a reposo.
  afterEach(async () => { clearAuthSession(); await act(async () => { await logout(); }); });
  return () => api;
}
