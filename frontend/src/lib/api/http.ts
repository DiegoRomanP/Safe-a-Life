import { ApiError, type ApiErrorKind } from '../demoApi.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestOptions = Readonly<{ body?: unknown; csrfToken?: string }>;

export function idempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function kindFor(status: number): ApiErrorKind {
  if (status === 403 || status === 404) return 'sin_permiso';
  if (status === 409) return 'conflicto';
  return 'red';
}

function errorCode(body: unknown): string | undefined {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Llamada al backend real por el proxy same-origin (ADR-004): cookies HttpOnly, sin caché ni referrer, Idempotency-Key en
 * cada mutación y CSRF cuando hay sesión. Todo fallo es un `ApiError` con el estado y el código del contrato.
 */
export async function apiRequest(method: Method, path: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = idempotencyKey();
  if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError('red');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(kindFor(response.status), response.status, errorCode(body));
  return body;
}
