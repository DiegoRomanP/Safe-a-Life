// Capa de datos de demostración con la forma de una llamada HTTP: responde de
// forma asíncrona y puede fallar como fallaría el backend. Cuando exista el
// cliente HTTP (D-4) se reemplaza esta capa y las vistas no cambian.

/** Fallos que las vistas saben mostrar. */
export type ApiErrorKind = 'red' | 'sin_permiso' | 'conflicto';

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind) {
    super(`ApiError: ${kind}`);
    this.name = 'ApiError';
  }
}

export function errorKindOf(error: unknown): ApiErrorKind {
  return error instanceof ApiError ? error.kind : 'red';
}

/**
 * Escenario forzado en desarrollo para ver cada estado sin backend:
 * - `normal`: responde bien.
 * - `cargando`: las lecturas no terminan nunca.
 * - `error`: lecturas y escrituras fallan como un corte de red (5xx o sin conexión).
 * - `sin_permiso`: lecturas y escrituras responden 403/404 neutro.
 * - `conflicto`: las escrituras responden 409; las lecturas funcionan.
 * En `cargando` las escrituras responden con normalidad.
 */
export type DemoScenario = 'normal' | 'cargando' | 'error' | 'sin_permiso' | 'conflicto';

// Latencia simulada. En las pruebas es 0 para no alargarlas.
const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 450;

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

/** Lectura simulada: `run` se evalúa al responder, con el estado de ese momento. */
export async function demoRead<T>(scenario: DemoScenario, run: () => T): Promise<T> {
  if (scenario === 'cargando') return new Promise<T>(() => {});
  await wait();
  if (scenario === 'error') throw new ApiError('red');
  if (scenario === 'sin_permiso') throw new ApiError('sin_permiso');
  return run();
}

/** Escritura simulada: si falla, `run` no se ejecuta y nada cambia. */
export async function demoWrite<T>(scenario: DemoScenario, run: () => T): Promise<T> {
  await wait();
  if (scenario === 'error') throw new ApiError('red');
  if (scenario === 'sin_permiso') throw new ApiError('sin_permiso');
  if (scenario === 'conflicto') throw new ApiError('conflicto');
  return run();
}
