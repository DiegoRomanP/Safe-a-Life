import { useCallback, useState } from 'react';
import { errorKindOf, type ApiErrorKind } from './demoApi.js';

export type MutationResult<R> = { ok: true; value: R } | { ok: false };

export type Mutation<A extends unknown[], R> = {
  /** Ejecuta la escritura. `ok` es false si falló; entonces nada cambió. */
  run: (...args: A) => Promise<MutationResult<R>>;
  pending: boolean;
  error: ApiErrorKind | null;
  reset: () => void;
};

/**
 * Escritura asíncrona. Mientras está en curso, `pending` evita un segundo
 * envío. Si falla, `error` dice por qué (red, sin permiso o conflicto) y nada
 * cambió.
 */
export function useDemoMutation<A extends unknown[], R>(write: (...args: A) => Promise<R>): Mutation<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiErrorKind | null>(null);

  const run = useCallback(
    async (...args: A): Promise<MutationResult<R>> => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, value: await write(...args) };
      } catch (caught) {
        setError(errorKindOf(caught));
        return { ok: false };
      } finally {
        setPending(false);
      }
    },
    [write],
  );

  const reset = useCallback(() => setError(null), []);
  return { run, pending, error, reset };
}
