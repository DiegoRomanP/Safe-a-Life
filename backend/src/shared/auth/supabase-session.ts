import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../config/env.js';
import { PersistenceUnavailableError, UpstreamRateLimitedError } from '../persistence/errors.js';
import { parseClaims } from './claims.js';
import type { MfaFactorSummary, SessionGateway, TokenPair, TotpEnrollment, VerifiedClaims } from './session-ports.js';

const AUTH_TIMEOUT_MS = 8_000;

export interface SupabaseSessionOptions {
  readonly fetch?: typeof fetch;
  /** Plazo por llamada a Auth (por defecto 8 s); inyectable para probar el aborto. */
  readonly timeoutMs?: number;
}

/** Lanza ante 429 del proveedor (cuota por IP del backend); no es un fallo de credenciales. */
function assertNotRateLimited(error: { status?: number; code?: string } | null | undefined): void {
  if (error && (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit')) {
    throw new UpstreamRateLimitedError();
  }
}

function isUnavailable(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status !== undefined && error.status >= 500);
}

function toPair(session: Pick<Session, 'access_token' | 'refresh_token' | 'expires_in'> | null | undefined): TokenPair | null {
  if (!session?.access_token || !session.refresh_token) return null;
  return Object.freeze({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
  });
}

/**
 * Adaptador de Supabase Auth con la anon key (ADR-004). Cada operación usa un
 * cliente efímero sin persistencia; nunca se comparte una sesión entre usuarios.
 * Los mensajes del proveedor no salen de este archivo.
 */
export function createSupabaseSessionGateway(
  config: Pick<AppConfig, 'supabase'>,
  options: SupabaseSessionOptions = {},
): SessionGateway {
  const { url, anonKey } = config.supabase;
  // `iss` de Supabase Auth es el origen del proyecto + /auth/v1, sin barra final ni ruta extra.
  const issuer = `${new URL(url).origin}/auth/v1`;
  // Ninguna llamada a Auth queda sin límite de tiempo: un Auth lento no debe retener los handlers.
  const baseFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS;
  const boundedFetch: typeof fetch = (input, init) =>
    baseFetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  const newClient = (): SupabaseClient =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedFetch },
    });

  /** Cliente efímero con la sesión del usuario para las llamadas de MFA. */
  const withSession = async (tokens: TokenPair): Promise<SupabaseClient> => {
    const client = newClient();
    const { error } = await client.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
    assertNotRateLimited(error);
    if (isUnavailable(error)) throw new PersistenceUnavailableError();
    return client;
  };

  const unavailableOr = <T>(error: { name?: string; status?: number; code?: string } | null | undefined, value: T): T => {
    assertNotRateLimited(error);
    if (isUnavailable(error)) throw new PersistenceUnavailableError();
    return value;
  };

  return {
    async verifyAccessToken(accessToken): Promise<VerifiedClaims | null> {
      // Cualquier excepción de verificación (alg desconocido, kid ajeno, JSON roto) es «sin sesión»,
      // nunca un 500; solo la indisponibilidad del proveedor se propaga.
      try {
        const { data, error } = await newClient().auth.getClaims(accessToken);
        unavailableOr(error, null);
        return error || !data ? null : parseClaims(data.claims, { issuer, audience: 'authenticated' });
      } catch (caught) {
        if (caught instanceof PersistenceUnavailableError || caught instanceof UpstreamRateLimitedError) throw caught;
        return null;
      }
    },

    async refresh(refreshToken) {
      const { data, error } = await newClient().auth.refreshSession({ refresh_token: refreshToken });
      return unavailableOr(error, error ? null : toPair(data.session));
    },

    async signIn(email, password) {
      const { data, error } = await newClient().auth.signInWithPassword({ email, password });
      return unavailableOr(error, error ? null : toPair(data.session));
    },

    async signOut(accessToken, scope = 'global') {
      const { error } = await newClient().auth.admin.signOut(accessToken, scope);
      // Un 429 no es «sesión ya revocada»: el refresh token seguiría vivo.
      assertNotRateLimited(error);
      // 401/403/404 significan que la sesión ya no existe: el objetivo se cumplió.
      if (isUnavailable(error)) throw new PersistenceUnavailableError();
    },

    async listTotpFactors(tokens): Promise<readonly MfaFactorSummary[]> {
      const client = await withSession(tokens);
      const { data, error } = await client.auth.mfa.listFactors();
      unavailableOr(error, null);
      if (error || !data) return [];
      return data.all
        .filter((factor) => factor.factor_type === 'totp')
        .map((factor) => Object.freeze({ factorId: factor.id, verified: factor.status === 'verified' }));
    },

    async unenrollFactor(tokens, factorId) {
      const client = await withSession(tokens);
      const { error } = await client.auth.mfa.unenroll({ factorId });
      unavailableOr(error, null);
    },

    async enrollTotp(tokens): Promise<TotpEnrollment | null> {
      const client = await withSession(tokens);
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Save a Life' });
      unavailableOr(error, null);
      if (error || !data?.totp?.uri) return null;
      return Object.freeze({ factorId: data.id, otpauthUri: data.totp.uri });
    },

    async challenge(tokens, factorId) {
      const client = await withSession(tokens);
      const { data, error } = await client.auth.mfa.challenge({ factorId });
      return unavailableOr(error, error || !data ? null : data.id);
    },

    async verify(tokens, factorId, challengeId, code) {
      const client = await withSession(tokens);
      const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
      return unavailableOr(error, error || !data ? null : toPair({
        access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in,
      }));
    },

    async challengeAndVerify(tokens, factorId, code) {
      const client = await withSession(tokens);
      const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      return unavailableOr(error, error || !data ? null : toPair({
        access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in,
      }));
    },
  };
}
