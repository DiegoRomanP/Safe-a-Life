import type { SupabaseClient } from '@supabase/supabase-js';
import { PersistenceError, PersistenceUnavailableError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 5_000;

export interface RpcOptions {
  readonly timeoutMs?: number;
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'AbortError' || name === 'TimeoutError' || name === 'TypeError'
    || (typeof message === 'string' && /fetch failed|aborted|timed? ?out|ECONN|ENOTFOUND/i.test(message));
}

/**
 * Ejecuta una RPC del esquema `api` y devuelve el valor sin interpretar. Nunca
 * propaga mensajes, códigos SQL ni detalles del proveedor.
 */
export async function callRpc(
  client: SupabaseClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: RpcOptions = {},
): Promise<unknown> {
  let result;
  try {
    result = await client.rpc(name, args as Record<string, unknown>).abortSignal(AbortSignal.timeout(timeoutMs));
  } catch (error) {
    throw isNetworkFailure(error) ? new PersistenceUnavailableError() : new PersistenceError();
  }

  if (result.error) {
    const { status } = result;
    if (status === 0 || status >= 500 || isNetworkFailure(result.error)) throw new PersistenceUnavailableError();
    throw new PersistenceError(status === 401 ? 'jwt' : 'rejected');
  }
  return result.data;
}
