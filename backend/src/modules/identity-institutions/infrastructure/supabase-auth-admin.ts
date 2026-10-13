import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/http/errors.js';
import { PersistenceError, PersistenceUnavailableError } from '../../../shared/persistence/errors.js';
import type { AuthAdmin } from '../application/auth-admin.ports.js';

const TIMEOUT_MS = 8_000;

export interface SupabaseAuthAdminOptions {
  readonly fetch?: typeof fetch;
}

interface ProviderError {
  readonly status?: number;
  readonly code?: string;
  readonly name?: string;
}

function isUnavailable(error: ProviderError | null | undefined): boolean {
  return error != null && (error.status === undefined || error.status === 0 || error.status >= 500 || error.name === 'AuthRetryableFetchError');
}

/** Una contraseña rechazada por la política de Auth es un error de validación, no un fallo interno. */
function failure(error: ProviderError): never {
  if (isUnavailable(error)) throw new PersistenceUnavailableError();
  if (error.code === 'same_password' || error.code === 'weak_password') throw new ApiError('VALIDATION_FAILED');
  throw new PersistenceError('rejected');
}

/**
 * ÚNICO archivo que usa `service_role` (ADR-006, vigilado por `service-role-allowlist.test.ts`). El cliente no
 * persiste sesión y nunca se reutiliza como cliente de petición. Nunca registra ni devuelve mensajes del proveedor.
 */
export function createSupabaseAuthAdmin(
  config: Pick<AppConfig, 'supabase'>,
  options: SupabaseAuthAdminOptions = {},
): AuthAdmin {
  const { url, serviceRoleKey } = config.supabase;
  const baseFetch = options.fetch ?? fetch;
  const boundedFetch: typeof fetch = (input, init) => baseFetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const client = (): SupabaseClient =>
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedFetch },
    });

  const admin: AuthAdmin = {
    async updatePassword(userId, newPassword) {
      const { error } = await client().auth.admin.updateUserById(userId, { password: newPassword });
      if (error) failure(error);
    },

    async updateEmail(userId, newEmail) {
      const { error } = await client().auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
      if (error) failure(error);
    },

    async deleteUser(userId) {
      const { error } = await client().auth.admin.deleteUser(userId);
      // 404: el usuario ya no existe; el objetivo se cumplió.
      if (error && error.status !== 404) failure(error);
    },

    async revokeAllSessions(userId) {
      // GoTrue no ofrece revocación por usuario: la función DEFINER api.worker_revoke_sessions borra sus sesiones.
      const { error } = await client().schema('api').rpc('worker_revoke_sessions', { p_user_id: userId });
      if (error) {
        if (error.code === undefined || /fetch|network/i.test(error.message)) throw new PersistenceUnavailableError();
        throw new PersistenceError('rejected');
      }
    },
  };
  return Object.freeze(admin);
}
