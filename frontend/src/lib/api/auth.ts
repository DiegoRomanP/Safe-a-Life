import { ApiError } from '../demoApi.js';
import { apiRequest } from './http.js';

export type ActorRole = 'donante' | 'admin_hospitalario' | 'superadmin';

export type LoginSession = Readonly<{
  role: ActorRole;
  aal: 1 | 2;
  mfaRequired: boolean;
  mfaChallengeId?: string;
}>;

type Credentials = Readonly<{ email: string; password: string }>;
type LoginResult = Readonly<{ session: LoginSession; csrfToken: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseSession(value: unknown): LoginSession {
  if (!isRecord(value) || !hasOnlyKeys(value, ['data']) || !isRecord(value.data)) throw new Error();
  const data = value.data;
  if (!hasOnlyKeys(data, ['actor', 'aal', 'mfaRequired', 'mfaChallengeId', 'expiresAt']) || !isRecord(data.actor)) throw new Error();
  const actor = data.actor;
  const role = actor.role;
  const roles: ActorRole[] = ['donante', 'admin_hospitalario', 'superadmin'];
  if (!hasOnlyKeys(actor, ['role', 'displayName', 'hospitalName']) || !roles.includes(role as ActorRole)) throw new Error();
  if (typeof actor.displayName !== 'string' || actor.displayName.length > 120) throw new Error();
  if (actor.hospitalName !== undefined && (typeof actor.hospitalName !== 'string' || actor.hospitalName.length > 160)) throw new Error();
  if ((data.aal !== 1 && data.aal !== 2) || typeof data.mfaRequired !== 'boolean') throw new Error();
  if (data.mfaChallengeId !== undefined && (typeof data.mfaChallengeId !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(data.mfaChallengeId))) throw new Error();
  if (data.expiresAt !== undefined && (typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)))) throw new Error();
  return {
    role: role as ActorRole,
    aal: data.aal,
    mfaRequired: data.mfaRequired,
    ...(typeof data.mfaChallengeId === 'string' ? { mfaChallengeId: data.mfaChallengeId } : {}),
  };
}

function parseCsrfToken(value: unknown): string {
  if (!isRecord(value) || !hasOnlyKeys(value, ['data']) || !isRecord(value.data)) throw new Error();
  const { data } = value;
  if (!hasOnlyKeys(data, ['token']) || typeof data.token !== 'string' || data.token.length < 32 || data.token.length > 512) throw new Error();
  return data.token;
}

export async function loginAndBootstrap(credentials: Credentials): Promise<LoginResult> {
  const session = parseSession(await apiRequest('POST', '/auth/sessions', { body: credentials }));
  const csrfToken = parseCsrfToken(await apiRequest('GET', '/auth/csrf-token'));
  return { session, csrfToken };
}

/** Restaura la sesión de las cookies tras una recarga; sin sesión (401) devuelve null. */
export async function fetchCurrentSession(): Promise<LoginResult | null> {
  let session: LoginSession;
  try {
    session = parseSession(await apiRequest('GET', '/auth/session'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
  return { session, csrfToken: parseCsrfToken(await apiRequest('GET', '/auth/csrf-token')) };
}

export async function deleteCurrentSession(csrfToken: string): Promise<void> {
  await apiRequest('DELETE', '/auth/sessions/current', { csrfToken });
}
