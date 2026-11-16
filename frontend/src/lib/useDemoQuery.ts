import { useCallback, useEffect, useState } from 'react';
import { errorKindOf, type ApiErrorKind } from './demoApi.js';
import { useQueryCache } from './queryCache.js';

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; kind: ApiErrorKind };

export type Query<T> = QueryState<T> & {
  /** Vuelve a pedir los datos mostrando «Cargando» (tras un error o un conflicto). */
  retry: () => void;
  /** true mientras se revalidan datos ya mostrados: no se debe actuar sobre ellos. */
  refreshing: boolean;
};

// Respuesta junto con la petición que la produjo (función, recurso e intento).
type Result<T> = { load: () => Promise<T>; resource: string; tries: number; state: QueryState<T> };

/**
 * Carga asíncrona con estados de carga, error y sin permiso.
 *
 * - `load` debe ser estable (useCallback) y cambiar cuando cambian los datos,
 *   para revalidar la vista después de una escritura.
 * - `resource` identifica qué se pide (escenario e ID). Si se revalida el
 *   mismo recurso tras una escritura, se siguen mostrando los datos anteriores
 *   (con `refreshing`) mientras llega la respuesta. Si se pide otro recurso o
 *   se reintenta, se muestra «Cargando», para no actuar sobre datos viejos.
 * - Con `cache: true` y un QueryCacheProvider, volver a la vista muestra al
 *   instante la última lectura del mismo recurso (con `refreshing`) mientras
 *   se revalida, en lugar de «Cargando», si sus datos no cambiaron desde que
 *   se guardó (misma identidad de `load`). Úsalo solo en vistas de lectura: un
 *   formulario que toma sus valores al montarse se quedaría con los viejos.
 *   Por eso `resource` debe ser único por vista (p. ej. `invitaciones:normal`).
 * - Con el cliente HTTP la revalidación no dependerá de la identidad de `load`:
 *   hará falta una clave o versión explícita (D-4).
 */
export function useDemoQuery<T>(load: () => Promise<T>, resource: string, options: { cache?: boolean } = {}): Query<T> {
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const areaCache = useQueryCache();
  const cache = options.cache ? areaCache : null;

  useEffect(() => {
    let active = true;
    const settle = (state: QueryState<T>) => {
      if (active) setResult({ load, resource, tries, state });
    };
    load().then(
      (data) => {
        if (active) cache?.set(resource, { load, data });
        settle({ status: 'ready', data });
      },
      (error: unknown) => settle({ status: 'error', kind: errorKindOf(error) }),
    );
    return () => {
      active = false;
    };
  }, [load, resource, tries, cache]);

  const retry = useCallback(() => setTries((current) => current + 1), []);

  const current = result?.load === load && result.resource === resource && result.tries === tries;
  const stale = !current && result?.resource === resource && result.tries === tries && result.state.status === 'ready';
  if (result && (current || stale)) return { ...result.state, retry, refreshing: stale };
  // Sin respuesta para este recurso: la última lectura guardada si los datos no
  // cambiaron desde entonces, salvo tras un reintento, que muestra «Cargando».
  const cached = cache?.get(resource);
  if (cached && cached.load === load && tries === 0) return { status: 'ready', data: cached.data as T, retry, refreshing: true };
  return { status: 'loading', retry, refreshing: false };
}
