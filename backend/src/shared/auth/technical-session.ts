import type { TokenPair } from './session-ports.js';

export interface TechnicalSessionDependencies {
  readonly signIn: () => Promise<TokenPair | null>;
  readonly refresh: (refreshToken: string) => Promise<TokenPair | null>;
  readonly now?: () => number;
  /** Margen antes del vencimiento para renovar (por defecto 60 s). */
  readonly skewMs?: number;
}

/**
 * Sesión técnica del worker (V13): inicia sesión con la identidad técnica, la reutiliza y la renueva antes de
 * que expire. Una sola renovación a la vez (single-flight); si el refresh falla se vuelve a iniciar sesión.
 * Nunca registra tokens ni credenciales.
 */
export function createTechnicalSession({ signIn, refresh, now = Date.now, skewMs = 60_000 }: TechnicalSessionDependencies) {
  let tokens: TokenPair | undefined;
  let expiresAt = 0;
  let inflight: Promise<string> | undefined;

  const adopt = (pair: TokenPair): string => {
    tokens = pair;
    expiresAt = now() + pair.expiresIn * 1000;
    return pair.accessToken;
  };

  const renew = async (): Promise<string> => {
    const renewed = tokens ? await refresh(tokens.refreshToken) : null;
    if (renewed) return adopt(renewed);
    tokens = undefined;
    const fresh = await signIn();
    if (!fresh) throw new Error('No se pudo iniciar la sesión técnica.');
    return adopt(fresh);
  };

  return Object.freeze({
    async accessToken(): Promise<string> {
      if (tokens && now() < expiresAt - skewMs) return tokens.accessToken;
      inflight ??= renew().finally(() => { inflight = undefined; });
      return inflight;
    },
    /** Descarta la sesión (p. ej. tras un 401 del proveedor) para forzar un nuevo inicio. */
    invalidate(): void {
      tokens = undefined;
      expiresAt = 0;
    },
  });
}

export type TechnicalSession = ReturnType<typeof createTechnicalSession>;
