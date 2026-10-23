export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function request(path: string, options: RequestOptions, csrf?: string): Promise<unknown> {
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (csrf) headers.set('X-CSRF-Token', csrf);
  let response: Response;
  try {
    response = await fetch(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  let envelope: unknown;
  try { envelope = response.status === 204 ? undefined : await response.json(); }
  catch { if (response.ok) throw new ApiError(502, 'INVALID_RESPONSE'); }
  if (!response.ok) {
    const code = isRecord(envelope) && isRecord(envelope.error) && typeof envelope.error.code === 'string' ? envelope.error.code : 'REQUEST_FAILED';
    const retry = Number(response.headers.get('Retry-After'));
    throw new ApiError(response.status, code, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  if (response.status === 204) return undefined;
  if (!isRecord(envelope) || !('data' in envelope)) throw new ApiError(502, 'INVALID_RESPONSE');
  return envelope.data;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // A relative allowlisted path keeps cookies and CSRF away from third-party hosts.
  if (!/^\/api\/v1\/[A-Za-z0-9_/?=&.%~-]+$/.test(path) || path.includes('..') || /%2f|%5c|%2e/i.test(path)) throw new ApiError(400, 'BAD_REQUEST');
  const write = options.method !== undefined && options.method !== 'GET';
  if (write && !options.idempotencyKey) throw new ApiError(400, 'IDEMPOTENCY_REQUIRED');
  let csrf: string | undefined;
  if (write && !(path === '/api/v1/auth/sessions' && options.method === 'POST')) {
    try {
      const data = await request('/api/v1/auth/csrf-token', { signal: options.signal });
      if (!isRecord(data) || typeof data.token !== 'string' || !data.token) throw new ApiError(502, 'INVALID_RESPONSE');
      csrf = data.token;
    } catch (error) {
      // Only logout may reach the server's stale-cookie cleanup after an expired session.
      if (!(path === '/api/v1/auth/sessions/current' && options.method === 'DELETE' && error instanceof ApiError && error.status === 401)) throw error;
    }
  }
  return await request(path, options, csrf) as T;
}

export function createMutationIntent() {
  let previous: string | undefined;
  let key: string | undefined;
  return {
    keyFor(path: string, body: unknown) {
      const next = JSON.stringify([path, body]);
      if (previous !== next || !key) { previous = next; key = crypto.randomUUID(); }
      return key;
    },
    reset() { previous = undefined; key = undefined; },
  };
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No pudimos completar la operación. Intenta nuevamente.';
  if (error.code === 'STEP_UP_REQUIRED') return 'Confirma nuevamente tu segundo factor para realizar esta acción.';
  if (error.code === 'MFA_REQUIRED') return 'Verifica tu segundo factor para continuar.';
  if (error.status === 401) return 'La sesión no está vigente o las credenciales no son válidas. Vuelve a ingresar.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para realizar esta acción.';
  if (error.status === 409) return 'El registro cambió o la acción ya no está disponible. Revisa los datos antes de continuar.';
  if (error.status === 429) return 'Se alcanzó el límite de intentos. Espera antes de volver a intentarlo.';
  if (error.status === 400 || error.status === 422) return 'Revisa los campos del formulario e intenta nuevamente.';
  if (error.status === 0) return 'No hay conexión con el servidor. Comprueba que el backend esté iniciado.';
  if (error.status >= 500) return 'El servicio no está disponible. Intenta nuevamente más tarde.';
  return 'No pudimos completar la operación. Intenta nuevamente.';
}

