import { flushSync } from 'react-dom';
import { loginAndBootstrap, type LoginSession } from '../../../lib/api/auth.js';

export type AuthSessionMemory = LoginSession & Readonly<{ csrfToken: string }>;
export type AuthOperationState = 'idle' | 'pending' | 'success' | 'error';
type LoginCredentials = Readonly<{ email: string; password: string }>;

// null means no locally verified session; it does not prove server logout.
let currentSession: AuthSessionMemory | null = null;
let operationState: AuthOperationState = 'idle';
let activeLogin: symbol | null = null;
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
  currentSession = null;
  publish('pending');

  void (async () => {
    try {
      const { session, csrfToken } = await loginAndBootstrap(credentials);
      if (activeLogin !== operation) return;
      currentSession = Object.freeze({ ...session, csrfToken });
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

export function setAuthSession(session: AuthSessionMemory): void {
  currentSession = Object.freeze({ ...session });
}

export function getAuthSession(): AuthSessionMemory | null {
  return currentSession;
}

export function clearAuthSession(): void {
  currentSession = null;
}
