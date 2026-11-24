import { apiRequest } from '../../lib/api/http.js';
import { dataOf, int, listAll as listAllShared, malformed, num, oneOf, rec, str } from '../../lib/api/validate.js';
import { ApiError } from '../../lib/demoApi.js';
import { BLOOD_TYPES } from '../../lib/format.js';
import { expireSession, getAuthSession } from '../auth/session/session.js';
import type { AssistedSignup, BatchRequestResult, HospitalNeed, HospitalSite, InvitationBatch, NeedCoverage, NeedResponse, NeedResponses, NewNeed } from './types.js';

const csrfToken = () => getAuthSession()?.csrfToken;

// Un 401 es sesión caída: se expira y el guard del área vuelve a /ingresar. Un 403 (membresía no activa, hospital no
// autorizado) llega tal cual: la vista lo trata como «sin acceso», no como lista vacía.
async function call(...args: Parameters<typeof apiRequest>): Promise<unknown> {
  try {
    return await apiRequest(...args);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) expireSession();
    throw error;
  }
}

const parseSite = (value: unknown): HospitalSite => {
  const v = rec(value);
  return { siteId: str(v.siteId, 64), publicName: str(v.publicName, 160) };
};

const NEED_STATUS = ['borrador', 'activa', 'meta_alcanzada', 'cerrada', 'cancelada', 'vencida'] as const;
const URGENCY = ['Normal', 'Urgente', 'Critica'] as const;
const parseNeed = (value: unknown): HospitalNeed => {
  const v = rec(value);
  return {
    needId: str(v.needId, 64),
    component: oneOf(v.component, ['RBC']),
    requiredBloodType: oneOf(v.requiredBloodType, BLOOD_TYPES),
    targetConfirmations: int(v.targetConfirmations, 1, 50),
    confirmedIntentCount: int(v.confirmedIntentCount, 0, Number.MAX_SAFE_INTEGER),
    siteId: str(v.siteId, 64),
    radiusKm: int(v.radiusKm, 1, 50),
    urgency: oneOf(v.urgency, URGENCY),
    status: oneOf(v.status, NEED_STATUS),
    expiresAt: str(v.expiresAt, 40),
  };
};

const parseSignup = (value: unknown): AssistedSignup => {
  const v = rec(value);
  return {
    signupId: str(v.signupId, 64),
    status: oneOf(v.status, ['pendiente', 'vencida', 'reclamada_incompleta', 'activa']),
    createdAt: str(v.createdAt, 40),
    activationExpiresAt: str(v.activationExpiresAt, 40),
    purgeAt: str(v.purgeAt, 40),
  };
};

const listAll = <T>(path: string, parse: (value: unknown) => T) => listAllShared(call, path, parse);
const write = (method: 'POST' | 'PATCH', path: string, body?: unknown) =>
  call(method, path, { ...(body !== undefined ? { body } : {}), csrfToken: csrfToken() });

export const fetchSites = () => listAll('/hospitals/me/sites', parseSite);
export const fetchNeeds = () => listAll('/hospitals/me/needs', parseNeed);
export const fetchSignups = () => listAll('/hospitals/me/assisted-signups', parseSignup);

/** createHospitalNeed: siempre nace en `borrador`; actor, hospital y propietario los deriva el servidor. */
export const createNeedRequest = async (input: NewNeed) =>
  parseNeed(dataOf(await write('POST', '/hospitals/me/needs', { component: 'RBC', ...input })));

/** transitionOwnHospitalNeed: `meta_alcanzada` y `vencida` los fija el servidor, no se piden. */
export const transitionNeedRequest = async (needId: string, status: 'activa' | 'cerrada' | 'cancelada') =>
  parseNeed(dataOf(await write('PATCH', `/hospitals/me/needs/${encodeURIComponent(needId)}`, { status })));

/** createAssistedSignup responde 202 con solo estado y fechas: el admin nunca ve correo ni nombre. */
export const createSignupRequest = async (input: { email: string; name?: string }) =>
  parseSignup(dataOf(await write('POST', '/hospitals/me/assisted-signups', input)));

/** reissueAssistedActivationLink responde 202 neutro sin el alta: quien llama recarga la lista. */
export const reissueSignupRequest = async (signupId: string) => {
  await write('POST', `/hospitals/me/assisted-signups/${encodeURIComponent(signupId)}/activation-links`);
};

// --- Invitaciones (F6/F7) ---------------------------------------------------------------------------------------------
const needPath = (needId: string) => `/hospitals/me/needs/${encodeURIComponent(needId)}`;
const DELIVERY = ['pendiente', 'enviada', 'entregada', 'fallida'] as const;

const parseBatch = (value: unknown): InvitationBatch => {
  const v = rec(value);
  const c = rec(v.deliveryCounts);
  const count = (field: unknown) => int(field, 0, 50);
  return {
    batchId: str(v.batchId, 64), createdAt: str(v.createdAt, 40), createdInvitationCount: count(v.createdInvitationCount),
    deliveryCounts: { pendiente: count(c.pendiente), enviada: count(c.enviada), entregada: count(c.entregada), fallida: count(c.fallida) },
  };
};

/** listOwnInvitationBatches (todas las páginas). 404 = necesidad ajena o inexistente. */
export const fetchBatches = (needId: string) => listAll(`${needPath(needId)}/invitation-batches`, parseBatch);

/** requestInvitationBatch: el servidor elige a los donantes (compatibles, disponibles, dentro del radio) y encola los correos. */
export async function requestBatch(needId: string): Promise<BatchRequestResult> {
  const v = rec(dataOf(await write('POST', `${needPath(needId)}/invitation-batches`)));
  return { batchId: str(v.batchId, 64), createdInvitationCount: int(v.createdInvitationCount, 0, 50), queuedEmailCount: int(v.queuedEmailCount, 0, 50) };
}

// Confirmada (nombre y grupo declarado) u opaca: forma cerrada de cada variante; un campo de más es un fallo.
const parseResponse = (value: unknown): NeedResponse => {
  const v = rec(value);
  if (v.response === 'confirmada') {
    if (Object.keys(v).length !== 5) malformed();
    return {
      needDonorCode: str(v.needDonorCode, 64), donorName: str(v.donorName, 120), declaredBloodType: oneOf(v.declaredBloodType, BLOOD_TYPES),
      response: 'confirmada', responseRecordedAt: str(v.responseRecordedAt, 40),
    };
  }
  if (Object.keys(v).length !== 4) malformed();
  return {
    needDonorCode: str(v.needDonorCode, 64), validity: oneOf(v.validity, ['activa', 'invalidada', 'vencida'] as const),
    delivery: oneOf(v.delivery, DELIVERY), response: oneOf(v.response, ['sin_respuesta', 'rechazada'] as const),
  };
};

/** listOwnNeedResponses (todas las páginas): el conteo de confirmaciones incluye las anonimizadas que no se listan. */
export async function fetchNeedResponses(needId: string): Promise<NeedResponses> {
  const items: NeedResponse[] = [];
  let confirmedIntentCount = 0;
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const query: string = `limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = rec(dataOf(await call('GET', `${needPath(needId)}/responses?${query}`)));
    if (!Array.isArray(data.items)) malformed();
    confirmedIntentCount = int(data.confirmedIntentCount, 0, Number.MAX_SAFE_INTEGER);
    items.push(...(data.items as unknown[]).map(parseResponse));
    const next: unknown = rec(data.pagination).nextCursor;
    if (next === null || next === undefined) return { confirmedIntentCount, items };
    cursor = str(next, 512);
  }
  throw new ApiError('red');
}

// Forma cerrada: un campo de más (una posición individual, un id) es un fallo, no un dato que se pinte.
const exactly = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) malformed();
  return value;
};

// Cubos (hacia abajo): el servidor nunca manda un conteo exacto ni un 1 a 4, que identificarían a alguien. Un valor fuera del cubo
// rechaza la respuesta entera.
const bucket = (value: unknown, allowed: readonly number[]): number => {
  const n = num(value);
  return allowed.includes(n) ? n : malformed();
};
const COUNT_BUCKETS = [0, 5, 10, 25] as const;

const parseCoverage = (value: unknown): NeedCoverage => {
  const v = exactly(rec(value), ['site', 'radiusKm', 'compatibleCount', 'nextBatchCount', 'rings', 'cells']);
  const site = exactly(rec(v.site), ['latitude', 'longitude']);
  if (!Array.isArray(v.rings) || v.rings.length < 1 || v.rings.length > 4 || !Array.isArray(v.cells) || v.cells.length > 500) malformed();
  return {
    site: { latitude: num(site.latitude), longitude: num(site.longitude) },
    radiusKm: int(v.radiusKm, 1, 50),
    // `null` = menos de 5 (k-anonimato).
    compatibleCount: v.compatibleCount === null ? null : bucket(v.compatibleCount, COUNT_BUCKETS),
    nextBatchCount: v.nextBatchCount === null ? null : bucket(v.nextBatchCount, COUNT_BUCKETS),
    rings: (v.rings as unknown[]).map((ring) => {
      const r = exactly(rec(ring), ['fromKm', 'toKm', 'count']);
      return { fromKm: num(r.fromKm), toKm: num(r.toKm), count: r.count === null ? null : bucket(r.count, COUNT_BUCKETS) };
    }),
    // Las celdas con menos de 5 donantes no llegan nunca (k-anonimato).
    cells: (v.cells as unknown[]).map((cell) => {
      const c = exactly(rec(cell), ['latitude', 'longitude', 'count']);
      return { latitude: num(c.latitude), longitude: num(c.longitude), count: bucket(c.count, [5, 10, 25]) };
    }),
  };
};

/** getNeedCoverage: solo agregados de una necesidad propia en borrador o activa. 404 = ajena o inexistente. */
export async function fetchCoverage(needId: string): Promise<NeedCoverage> {
  return parseCoverage(dataOf(await call('GET', `${needPath(needId)}/coverage`)));
}
