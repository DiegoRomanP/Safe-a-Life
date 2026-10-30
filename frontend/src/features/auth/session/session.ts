import { flushSync } from 'react-dom';
import { ApiError } from '../../../lib/demoApi.js';
import { deleteCurrentSession, fetchCurrentSession, loginAndBootstrap, type LoginSession } from '../../../lib/api/auth.js';

export type AuthSessionMemory = LoginSession & Readonly<{ csrfToken: string }>;
export type AuthOperationState = 'idle' | 'pending' | 'success' | 'error';
type LoginCredentials = Readonly<{ email: string; password: string }>;

// null means no locally verified session; it does not prove server logout.
let currentSession: AuthSessionMemory | null = null;
let operationState: AuthOperationState = 'idle';
let activeLogin: symbol | null = null;
// Cada login o logout abre una época nueva: una restauración de una época anterior ya no puede escribir la sesión.
let epoch = 0;
// Si el servidor no confirmó el cierre, sus cookies pueden seguir vivas: esta pestaña no las restaura hasta un login nuevo.
let signedOutLocally = false;
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

export function setAuthSession(session: AuthSessionMemory): void {
  currentSession = Object.freeze({ ...session });
}

export function getAuthSession(): AuthSessionMemory | null {
  return currentSession;
}

export function clearAuthSession(): void {
  currentSession = null;
}
