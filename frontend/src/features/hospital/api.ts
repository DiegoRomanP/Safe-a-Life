import { apiRequest } from '../../lib/api/http.js';
import { dataOf, int, listAll as listAllShared, oneOf, rec, str } from '../../lib/api/validate.js';
import { ApiError } from '../../lib/demoApi.js';
import { BLOOD_TYPES } from '../../lib/format.js';
import { expireSession, getAuthSession } from '../auth/session/session.js';
import type { AssistedSignup, HospitalNeed, HospitalSite, NewNeed } from './types.js';

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
