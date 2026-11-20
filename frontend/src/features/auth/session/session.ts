import { flushSync } from 'react-dom';
import { ApiError } from '../../../lib/demoApi.js';
import { deleteCurrentSession, enrollMfa as enrollMfaRequest, fetchCsrfToken, fetchCurrentSession, loginAndBootstrap, verifyMfa as verifyMfaRequest, verifyStepUp as verifyStepUpRequest, type LoginSession, type MfaEnrollment } from '../../../lib/api/auth.js';

export type AuthSessionMemory = LoginSession & Readonly<{ csrfToken: string }>;
export type AuthOperationState = 'idle' | 'pending' | 'success' | 'error' | 'expired';
type LoginCredentials = Readonly<{ email: string; password: string }>;

// null means no locally verified session; it does not prove server logout.
let currentSession: AuthSessionMemory | null = null;
let operationState: AuthOperationState = 'idle';
let activeLogin: symbol | null = null;
// Cada login o logout abre una época nueva: una restauración de una época anterior ya no puede escribir la sesión.
let epoch = 0;
// Si el servidor no confirmó el cierre, sus cookies pueden seguir vivas: esta pestaña no las restaura hasta un login nuevo.
let signedOutLocally = false;
// Hasta cuándo vale el step-up (verifiedUntil del servidor, máx. 5 min). Solo es una pista de UX: el backend decide.
let stepUpUntil = 0;
const listeners = new Set<() => void>();

function publish(state: AuthOperationState): void {
  operationState = state;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  if (state === 'pending') notify();
  else flushSync(notify);
}

export function getAuthOperationState(): AuthOperationState {
  return operationState;
}

export function subscribeAuthOperation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginLogin(credentials: LoginCredentials): void {
  if (activeLogin !== null) return;
  const operation = Symbol();
  activeLogin = operation;
  epoch += 1;
  currentSession = null;
  stepUpUntil = 0;
  publish('pending');

  void (async () => {
    try {
      const { session, csrfToken } = await loginAndBootstrap(credentials);
      if (activeLogin !== operation) return;
      currentSession = Object.freeze({ ...session, csrfToken });
      signedOutLocally = false;
      activeLogin = null;
      publish('success');
    } catch {
      if (activeLogin !== operation) return;
      currentSession = null;
      activeLogin = null;
      publish('error');
    }
  })();
}

let restoring: Promise<AuthSessionMemory | null> | null = null;

/** Tras una recarga, la sesión vive solo en las cookies HttpOnly: se pide al backend una vez y se guarda en memoria. */
export function restoreSession(): Promise<AuthSessionMemory | null> {
  if (currentSession) return Promise.resolve(currentSession);
  if (signedOutLocally) return Promise.resolve(null);
  const started = epoch;
  restoring ??= fetchCurrentSession()
    .then((result) => {
      if (epoch !== started) return null;
      if (result && !currentSession) currentSession = Object.freeze({ ...result.session, csrfToken: result.csrfToken });
      return currentSession;
    })
    .finally(() => { restoring = null; });
  return restoring;
}

/**
 * Cierra la sesión del servidor (borra las cookies) y la de memoria. Solo 204 o 401 confirman el cierre; si no, la memoria
 * se borra igual, la pestaña deja de restaurar y se relanza el error para avisar a la persona.
 */
export async function logout(): Promise<void> {
  const session = currentSession;
  epoch += 1;
  restoring = null;
  currentSession = null;
  stepUpUntil = 0;
  try {
    if (session) await deleteCurrentSession(session.csrfToken);
    signedOutLocally = false;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      signedOutLocally = true;
      throw error;
    }
  } finally {
    publish('idle');
  }
}

/** Marca el 401 de «ya no hay sesión local» para distinguirlo de un código incorrecto (también 401 del backend). */
export const SESSION_LOST = 'SESSION_LOST';

function requireSession(): AuthSessionMemory {
  if (!currentSession) throw new ApiError('sin_permiso', 401, SESSION_LOST);
  return currentSession;
}

/** Alta del factor TOTP con la sesión aal 1 en memoria. */
export function enrollMfa(): Promise<MfaEnrollment> {
  return enrollMfaRequest(requireSession().csrfToken);
}

/**
 * Verifica el código TOTP y reemplaza la sesión por la de aal 2. Un 401 aquí es código incorrecto o vencido, no una sesión
 * caída: no se expira la sesión para que la persona pueda reintentar.
 */
export async function verifyMfa(challengeId: string, code: string): Promise<AuthSessionMemory> {
  const started = epoch;
  const session = await verifyMfaRequest(requireSession().csrfToken, challengeId, code);
  // El servidor ya elevó la sesión y el reto está consumido: si el CSRF nuevo falla, la memoria no es confiable y la salida
  // es volver a ingresar (la sesión de aal 2 sigue en las cookies).
  const csrfToken = await fetchCsrfToken().catch(() => null);
  if (epoch !== started || csrfToken === null) {
    currentSession = null;
    throw new ApiError('sin_permiso', 401, SESSION_LOST);
  }
  currentSession = Object.freeze({ ...session, csrfToken });
  return currentSession;
}

export function isStepUpValid(now = Date.now()): boolean {
  return now < stepUpUntil;
}

/** El backend rechazó una acción por step-up vencido: la próxima acción vuelve a pedir el código. */
export function clearStepUp(): void {
  stepUpUntil = 0;
}

/** POST /auth/step-up-verifications. Un 401 es código incorrecto, no sesión caída: no se expira la sesión. */
export async function verifyStepUpCode(code: string): Promise<void> {
  const until = await verifyStepUpRequest(requireSession().csrfToken, code);
  // Tope local de 5 minutos (ADR-004): no se confía en un `verifiedUntil` más largo para la pista de UX.
  stepUpUntil = Math.min(Date.parse(until), Date.now() + 5 * 60_000);
}

/** El backend respondió 401 a mitad de uso: la sesión ya no existe. Se olvida y el área vuelve a /ingresar con aviso. */
export function expireSession(): void {
  epoch += 1;
  restoring = null;
  currentSession = null;
  stepUpUntil = 0;
  publish('expired');
}

export function setAuthSession(session: AuthSessionMemory): void {
  currentSession = Object.freeze({ ...session });
}

export function getAuthSession(): AuthSessionMemory | null {
  return currentSession;
}

export function clearAuthSession(): void {
  currentSession = null;
}
