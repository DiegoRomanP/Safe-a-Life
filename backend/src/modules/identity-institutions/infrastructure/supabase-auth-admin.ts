import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/http/errors.js';
import { PersistenceError, PersistenceUnavailableError } from '../../../shared/persistence/errors.js';
import type { AuthAdmin } from '../application/auth-admin.ports.js';

const TIMEOUT_MS = 8_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      // Se llama al endpoint directamente: con un correo ya ocupado Auth responde 500 con la violación de unicidad de SQL
      // (23505) y el cliente lo trata como un fallo reintentable, indistinguible de una caída real. Solo se inspecciona el
      // código; el texto del proveedor nunca se devuelve ni se registra.
      let response: Response;
      try {
        response = await boundedFetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ email: newEmail, email_confirm: true }),
        });
      } catch {
        throw new PersistenceUnavailableError();
      }
      if (response.ok) return;
      const body = (await response.json().catch(() => null)) as { code?: unknown; error_code?: unknown } | null;
      if (body?.code === '23505' || body?.error_code === 'email_exists') throw new PersistenceError('rejected');
      if (response.status >= 500 || response.status === 429) throw new PersistenceUnavailableError();
      throw new PersistenceError('rejected');
    },

    async deleteInertUser(userId, email, minAgeSeconds) {
      // Borrado condicional y atómico en la base (api.worker_delete_inert_user): no hay carrera entre comprobar y borrar.
      const { data, error } = await client().schema('api').rpc('worker_delete_inert_user', {
        p_user_id: userId, p_email: email, p_min_age: `${Math.max(0, Math.floor(minAgeSeconds))} seconds`,
      });
      if (error) {
        if (error.code === undefined || /fetch|network/i.test(error.message)) throw new PersistenceUnavailableError();
        throw new PersistenceError('rejected');
      }
      return data === true;
    },

    async revokeAllSessions(userId) {
      // GoTrue no ofrece revocación por usuario: la función DEFINER api.worker_revoke_sessions borra sus sesiones.
      const { error } = await client().schema('api').rpc('worker_revoke_sessions', { p_user_id: userId });
      if (error) {
        if (error.code === undefined || /fetch|network/i.test(error.message)) throw new PersistenceUnavailableError();
        throw new PersistenceError('rejected');
      }
    },

    async deleteAccount(userId) {
      if (!UUID.test(userId)) throw new PersistenceError('rejected'); // nunca llamar a Auth con un id raro
      let error;
      try {
        ({ error } = await client().auth.admin.deleteUser(userId, false)); // borrado definitivo, no soft delete
      } catch {
        throw new PersistenceUnavailableError(); // el SDK lanzó: Auth pudo borrar, resultado incierto
      }
      if (!error) return;
      if (error.status === 404 || error.code === 'user_not_found') return; // ya no existe: idempotente
      if (isUnavailable(error) || error.status === 429) throw new PersistenceUnavailableError();
      throw new PersistenceError('rejected');
    },
  };
  return Object.freeze(admin);
}
