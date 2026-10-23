import { apiRequest, ApiError, isRecord } from './client.js';

export type Session = {
  actor: { role: 'donante' | 'admin_hospitalario' | 'superadmin'; displayName: string; hospitalName?: string };
  aal: 1 | 2;
  mfaRequired: boolean;
  mfaChallengeId?: string;
};
export type MfaEnrollment = { factorId: string; otpauthUri: string; challengeId: string };
let challengeId: string | undefined;

function sessionOf(value: unknown): Session {
  if (!isRecord(value) || !isRecord(value.actor)) throw new ApiError(502, 'INVALID_RESPONSE');
  const { actor, aal, mfaRequired, mfaChallengeId } = value;
  if ((actor.role !== 'donante' && actor.role !== 'admin_hospitalario' && actor.role !== 'superadmin') || typeof actor.displayName !== 'string' || (actor.hospitalName !== undefined && typeof actor.hospitalName !== 'string') || (aal !== 1 && aal !== 2) || typeof mfaRequired !== 'boolean' || (mfaChallengeId !== undefined && (typeof mfaChallengeId !== 'string' || !mfaChallengeId))) throw new ApiError(502, 'INVALID_RESPONSE');
  return {
    actor: { role: actor.role, displayName: actor.displayName, ...(typeof actor.hospitalName === 'string' ? { hospitalName: actor.hospitalName } : {}) },
    aal, mfaRequired, ...(typeof mfaChallengeId === 'string' ? { mfaChallengeId } : {}),
  };
}
export async function getSession(): Promise<Session> {
  return sessionOf(await apiRequest('/api/v1/auth/session'));
}
export async function login(credentials: { email: string; password: string }, key: string): Promise<Session> {
  challengeId = undefined;
  const session = sessionOf(await apiRequest('/api/v1/auth/sessions', { method: 'POST', body: credentials, idempotencyKey: key }));
  challengeId = session.mfaChallengeId;
  return session;
}
export function pendingMfaChallenge(): string | undefined { return challengeId; }
export function clearPendingMfaChallenge(): void { challengeId = undefined; }
export function mfaSetupSecret(uri: string): string {
  try {
    if (uri.length > 2048) throw new Error();
    const parsed = new URL(uri);
    const secret = parsed.searchParams.get('secret') ?? '';
    if (parsed.protocol !== 'otpauth:' || parsed.hostname !== 'totp' || parsed.username || parsed.password || parsed.hash || parsed.pathname.length < 2 || parsed.searchParams.getAll('secret').length !== 1 || !/^[A-Z2-7]{8,128}={0,6}$/i.test(secret) || (parsed.searchParams.get('algorithm') ?? 'SHA1').toUpperCase() !== 'SHA1' || (parsed.searchParams.get('digits') ?? '6') !== '6' || (parsed.searchParams.get('period') ?? '30') !== '30') throw new Error();
    return secret.replace(/=+$/, '').toUpperCase();
  } catch {
    throw new ApiError(502, 'INVALID_RESPONSE');
  }
}
export async function enrollMfa(key: string): Promise<MfaEnrollment> {
  const value = await apiRequest<unknown>('/api/v1/auth/mfa-enrollments', { method: 'POST', idempotencyKey: key });
  if (!isRecord(value) || typeof value.factorId !== 'string' || typeof value.challengeId !== 'string' || typeof value.otpauthUri !== 'string' || !value.otpauthUri.startsWith('otpauth://totp/')) throw new ApiError(502, 'INVALID_RESPONSE');
  mfaSetupSecret(value.otpauthUri);
  return { factorId: value.factorId, otpauthUri: value.otpauthUri, challengeId: value.challengeId };
}
export async function verifyMfa(id: string, code: string, key: string): Promise<Session> {
  const session = sessionOf(await apiRequest('/api/v1/auth/mfa-verifications', { method: 'POST', body: { challengeId: id, code }, idempotencyKey: key }));
  challengeId = undefined;
  return session;
}
export async function verifyStepUp(code: string, key: string): Promise<{ verifiedUntil: string }> {
  const value = await apiRequest<unknown>('/api/v1/auth/step-up-verifications', { method: 'POST', body: { code }, idempotencyKey: key });
  if (!isRecord(value) || typeof value.verifiedUntil !== 'string' || !Number.isFinite(Date.parse(value.verifiedUntil))) throw new ApiError(502, 'INVALID_RESPONSE');
  return { verifiedUntil: value.verifiedUntil };
}
export async function logout(key: string = crypto.randomUUID()): Promise<void> {
  try { await apiRequest('/api/v1/auth/sessions/current', { method: 'DELETE', idempotencyKey: key }); }
  catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
  finally { challengeId = undefined; }
}
export function safeAdminReturn(value: unknown): string {
  return typeof value === 'string' && /^\/superadmin(?:\/[a-zA-Z0-9_-]+)*$/.test(value) ? value : '/superadmin/tareas';
}


