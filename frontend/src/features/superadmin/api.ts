import { apiRequest } from '../../lib/api/http.js';
import { ApiError } from '../../lib/demoApi.js';
import { BLOOD_TYPES } from '../../lib/format.js';
import { bool, dataOf, listAll as listAllShared, malformed, num, oneOf, rec, str } from '../../lib/api/validate.js';
import { parseCorrectionRequest } from '../../lib/api/correctionRequest.js';
import { clearStepUp, expireSession, getAuthSession } from '../auth/session/session.js';
import type {
  AuditEvent,
  ContextualDonorData,
  DonorValues,
  Hospital,
  Membership,
  Site,
  SuperadminConfiguration,
  SuperadminTask,
} from './types.js';

export type GrantField = 'name' | 'email' | 'declaredBloodType';
export type NewSite = Pick<Site, 'hospitalId' | 'publicName' | 'publicAddress' | 'coordinates'>;
export type AccessGrant = Readonly<{ grantId: string; expiresAt: string }>;

const csrfToken = () => getAuthSession()?.csrfToken;
// Un 401 es sesión caída (se expira). STEP_UP_REQUIRED es un 403 con el mensaje genérico: se olvida el step-up local para que
// la próxima acción vuelva a pedir el código (el backend es quien decide).
async function call(...args: Parameters<typeof apiRequest>): Promise<unknown> {
  try {
    return await apiRequest(...args);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) expireSession();
    if (error instanceof ApiError && error.code === 'STEP_UP_REQUIRED') clearStepUp();
    throw error;
  }
}

const parseTask = (value: unknown): SuperadminTask => {
  const v = rec(value);
  return {
    taskId: str(v.taskId, 64),
    kind: oneOf(v.kind, ['correction_request', 'hospital_review', 'recognition_policy', 'delivery_failure']),
    createdAt: str(v.createdAt, 40),
    ...(v.resourceCode !== undefined ? { resourceCode: str(v.resourceCode, 64) } : {}),
  };
};

const parseHospital = (value: unknown): Hospital => {
  const v = rec(value);
  return {
    hospitalId: str(v.hospitalId, 64),
    publicName: str(v.publicName, 160),
    ...(v.legalName !== undefined ? { legalName: str(v.legalName, 200) } : {}),
    isAuthorized: bool(v.isAuthorized),
    createdAt: str(v.createdAt, 40),
  };
};

const parseSite = (value: unknown): Site => {
  const v = rec(value);
  const c = rec(v.coordinates);
  return {
    siteId: str(v.siteId, 64),
    hospitalId: str(v.hospitalId, 64),
    publicName: str(v.publicName, 160),
    ...(v.publicAddress !== undefined ? { publicAddress: str(v.publicAddress, 240) } : {}),
    coordinates: { latitude: num(c.latitude), longitude: num(c.longitude) },
    ...(v.publicInstructions !== undefined ? { publicInstructions: v.publicInstructions === null ? null : str(v.publicInstructions) } : {}),
    isActive: bool(v.isActive),
    isApproved: bool(v.isApproved),
  };
};

const parseMembership = (value: unknown): Membership => {
  const v = rec(value);
  return {
    membershipId: str(v.membershipId, 64),
    hospitalId: str(v.hospitalId, 64),
    role: oneOf(v.role, ['admin_hospitalario']),
    status: oneOf(v.status, ['pendiente', 'activa', 'revocada']),
    emailHint: str(v.emailHint, 100),
  };
};

const parseAudit = (value: unknown): AuditEvent => {
  const v = rec(value);
  return {
    eventId: str(v.eventId, 64),
    actorCode: str(v.actorCode, 64),
    event: str(v.event, 100),
    resourceCode: str(v.resourceCode, 64),
    result: oneOf(v.result, ['ok', 'denegado', 'fallido']),
    occurredAt: str(v.occurredAt, 40),
    ...(v.reason !== undefined ? { reason: str(v.reason, 300) } : {}),
  };
};

const parseConfiguration = (value: unknown): SuperadminConfiguration => {
  const v = rec(value);
  return { finalDemoAt: v.finalDemoAt === null ? null : str(v.finalDemoAt, 40), isImmutable: bool(v.isImmutable) };
};

const parseValues = (value: unknown): DonorValues => {
  const v = rec(value);
  return {
    ...(v.name !== undefined ? { name: str(v.name, 120) } : {}),
    ...(v.email !== undefined ? { email: str(v.email, 254) } : {}),
    ...(v.declaredBloodType !== undefined ? { declaredBloodType: oneOf(v.declaredBloodType, BLOOD_TYPES) } : {}),
  };
};

const parseGrant = (value: unknown): AccessGrant => {
  const v = rec(value);
  return { grantId: str(v.grantId, 64), expiresAt: str(v.expiresAt, 40) };
};

const listAll = <T>(path: string, parse: (value: unknown) => T) => listAllShared(call, path, parse);

const itemsOf = <T>(body: unknown, parse: (value: unknown) => T): T[] => {
  const data = rec(dataOf(body));
  return Array.isArray(data.items) ? (data.items as unknown[]).map(parse) : malformed();
};

const write = (method: 'POST' | 'PATCH', path: string, body?: unknown, headers?: Record<string, string>) =>
  call(method, path, { ...(body !== undefined ? { body } : {}), csrfToken: csrfToken(), ...(headers ? { headers } : {}) });

export const fetchTasks = async () => itemsOf(await call('GET', '/superadmin/task-queue'), parseTask);
export const fetchHospitals = () => listAll('/superadmin/hospitals', parseHospital);
export const fetchMemberships = () => listAll('/superadmin/memberships', parseMembership);
export const fetchAuditEvents = () => listAll('/superadmin/audit-events', parseAudit);
export const fetchRequests = () => listAll('/superadmin/correction-requests', parseCorrectionRequest);
export const fetchConfiguration = async () => parseConfiguration(dataOf(await call('GET', '/superadmin/configuration')));
export const fetchSites = async (hospitalId: string) =>
  itemsOf(await call('GET', `/superadmin/hospitals/${encodeURIComponent(hospitalId)}/sites`), parseSite);

export const createHospitalRequest = async (input: { publicName: string; legalName: string }) =>
  parseHospital(dataOf(await write('POST', '/superadmin/hospitals', input)));
export const updateHospitalAuthorization = async (hospitalId: string, isAuthorized: boolean) =>
  parseHospital(dataOf(await write('PATCH', `/superadmin/hospitals/${encodeURIComponent(hospitalId)}`, { isAuthorized })));

export const createSiteRequest = async ({ hospitalId, ...body }: NewSite) =>
  parseSite(dataOf(await write('POST', `/superadmin/hospitals/${encodeURIComponent(hospitalId)}/sites`, body)));
export const approveSiteRequest = async (siteId: string) =>
  parseSite(dataOf(await write('PATCH', `/superadmin/sites/${encodeURIComponent(siteId)}`, { isApproved: true, isActive: true })));

/** inviteHospitalAdmin responde 202 neutro y no devuelve la membresía: quien llama recarga la lista. */
export const inviteAdminRequest = async (input: { email: string; hospitalId: string }) => { await write('POST', '/superadmin/hospital-admin-invitations', input); };
export const revokeMembershipRequest = async (membershipId: string, reason: string) =>
  parseMembership(dataOf(await write('PATCH', `/superadmin/memberships/${encodeURIComponent(membershipId)}`, { status: 'revocada', reason })));

export const decideRequestRequest = async (requestId: string, decision: 'aprobada' | 'rechazada', reason: string) =>
  parseCorrectionRequest(dataOf(await write('PATCH', `/superadmin/correction-requests/${encodeURIComponent(requestId)}`, { decision, reason })));

export const createAccessGrant = async (requestId: string, action: 'review' | 'execute', allowedFields: GrantField[], reason: string) =>
  parseGrant(dataOf(await write('POST', '/superadmin/access-grants', { requestId, action, allowedFields, reason })));

/** El grant viaja en la cabecera X-Contextual-Grant (su grantId) y no se registra ni se guarda fuera de memoria. */
export async function fetchDonorData(requestId: string, grant: AccessGrant): Promise<ContextualDonorData> {
  const body = rec(dataOf(await call('GET', `/superadmin/correction-requests/${encodeURIComponent(requestId)}/donor-data`, { headers: { 'X-Contextual-Grant': grant.grantId } })));
  return { currentValues: parseValues(body.currentValues), proposedValues: parseValues(body.proposedValues) };
}

export const executeRequestRequest = async (requestId: string, grant: AccessGrant) =>
  parseCorrectionRequest(dataOf(await write('POST', `/superadmin/correction-requests/${encodeURIComponent(requestId)}/executions`, undefined, { 'X-Contextual-Grant': grant.grantId })));

export const setFinalDemoAtRequest = async (finalDemoAt: string) =>
  parseConfiguration(dataOf(await write('PATCH', '/superadmin/configuration', { finalDemoAt })));
