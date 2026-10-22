import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../config/env.js';

export interface SupabaseFactory {
  /** Un cliente nuevo por petición, autenticado con el JWT del usuario. Nunca se comparte entre usuarios. */
  forUser(accessToken: string): SupabaseClient;
  /** Cliente con la anon key (login, vistas previas por token, readiness). */
  anonymous(): SupabaseClient;
}

export interface SupabaseFactoryOptions {
  readonly fetch?: typeof fetch;
}

export function createSupabaseFactory(
  config: Pick<AppConfig, 'supabase'>,
  options: SupabaseFactoryOptions = {},
): SupabaseFactory {
  const { url, anonKey } = config.supabase;
  // El esquema `api` se fija en tiempo de ejecución; los tipos genéricos del SDK solo conocen `public`.
  const build = (accessToken?: string): SupabaseClient =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: 'api' },
      global: {
        ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    }) as unknown as SupabaseClient;

  return Object.freeze({
    forUser: (accessToken: string) => build(accessToken),
    anonymous: () => build(),
  });
}
