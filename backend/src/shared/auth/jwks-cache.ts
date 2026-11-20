import { PersistenceUnavailableError } from '../persistence/errors.js';

/** Algoritmos asimétricos que Supabase Auth usa para firmar; `HS*` y `none` nunca se verifican localmente. */
const ASYMMETRIC_ALGS = new Set(['ES256', 'RS256']);
const TTL_MS = 10 * 60 * 1000;
/** Un `kid` desconocido fuerza como mucho una descarga por minuto (rotación de claves), nunca una por petición (M2). */
const MIN_REFRESH_MS = 60 * 1000;

export interface Jwk {
  readonly kid: string;
  readonly alg: string;
  readonly [field: string]: unknown;
}

export interface JwksCacheOptions {
  readonly url: string;
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

export type KeyLookup =
  /** El proyecto no publica claves asimétricas (HS256 heredado): solo Auth puede verificar el token. */
  | { readonly mode: 'symmetric' }
  | { readonly mode: 'asymmetric'; readonly key: Jwk | null };

function parseKeys(value: unknown): Jwk[] {
  const keys = (value as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(keys)) throw new PersistenceUnavailableError();
  return keys.filter((key): key is Jwk => typeof key?.kid === 'string' && typeof key?.alg === 'string' && ASYMMETRIC_ALGS.has(key.alg));
}

/**
 * Caché del JWKS de Supabase Auth (`SUPABASE_JWKS_URL`). Descarga con single-flight, la renueva cada 10 min y, ante un
 * `kid` que no conoce, vuelve a descargar como mucho una vez por minuto. Un JWKS inalcanzable sin copia previa es
 * indisponibilidad (503); con copia previa se sigue usando la copia.
 */
export function createJwksCache({ url, fetch: fetchFn, now = Date.now }: JwksCacheOptions) {
  let keys: Jwk[] | undefined;
  let fetchedAt = 0;
  let inflight: Promise<void> | undefined;

  const download = async (): Promise<void> => {
    try {
      const response = await fetchFn(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new PersistenceUnavailableError();
      keys = parseKeys(await response.json());
    } catch {
      if (!keys) throw new PersistenceUnavailableError();
    }
    fetchedAt = now();
  };

  const refresh = (): Promise<void> => {
    inflight ??= download().finally(() => { inflight = undefined; });
    return inflight;
  };

  return Object.freeze({
    /** Busca la clave para la cabecera del token. `key: null` significa «rechazar sin llamar a Auth». */
    async lookup(header: Readonly<{ alg?: unknown; kid?: unknown }>): Promise<KeyLookup> {
      if (!keys || now() - fetchedAt >= TTL_MS) await refresh();
      if (keys!.length === 0) return { mode: 'symmetric' };
      if (typeof header.alg !== 'string' || !ASYMMETRIC_ALGS.has(header.alg) || typeof header.kid !== 'string') {
        return { mode: 'asymmetric', key: null };
      }
      let key = keys!.find((candidate) => candidate.kid === header.kid);
      if (!key && now() - fetchedAt >= MIN_REFRESH_MS) {
        await refresh();
        key = keys!.find((candidate) => candidate.kid === header.kid);
      }
      return { mode: 'asymmetric', key: key && key.alg === header.alg ? key : null };
    },
  });
}

/** Cabecera de un JWT sin verificar, solo para elegir la clave. `null` si no tiene forma de JWT. */
export function decodeJwtHeader(token: string): Readonly<{ alg?: unknown; kid?: unknown }> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] === '') return null;
  try {
    const header: unknown = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    return typeof header === 'object' && header !== null && !Array.isArray(header) ? header : null;
  } catch {
    return null;
  }
}
