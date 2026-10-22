import { useCallback, useEffect, useState } from 'react';
import { errorKindOf, type ApiErrorKind } from './demoApi.js';

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; kind: ApiErrorKind };

export type Query<T> = QueryState<T> & { retry: () => void };

// Respuesta junto con la petición que la produjo (función, recurso e intento).
type Result<T> = { load: () => Promise<T>; resource: string; tries: number; state: QueryState<T> };

/**
 * Carga asíncrona con estados de carga, error y sin permiso.
 *
 * - `load` debe ser estable (useCallback) y cambiar cuando cambian los datos,
 *   para revalidar la vista después de una escritura.
 * - `resource` identifica qué se pide (escenario e ID). Si se revalida el
 *   mismo recurso, se siguen mostrando los datos anteriores mientras llega la
 *   respuesta. Si se pide otro recurso o se reintenta tras un error, se
 *   muestra «Cargando».
 */
export function useDemoQuery<T>(load: () => Promise<T>, resource: string): Query<T> {
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    let active = true;
    const settle = (state: QueryState<T>) => {
      if (active) setResult({ load, resource, tries, state });
    };
    load().then(
      (data) => settle({ status: 'ready', data }),
      (error: unknown) => settle({ status: 'error', kind: errorKindOf(error) }),
    );
    return () => {
      active = false;
    };
  }, [load, resource, tries]);

  const retry = useCallback(() => setTries((current) => current + 1), []);

  const current = result?.load === load && result.resource === resource && result.tries === tries;
  const stale = result?.resource === resource && result.state.status === 'ready';
  const state: QueryState<T> = result && (current || stale) ? result.state : { status: 'loading' };
  return { ...state, retry };
}
