import { ApiError } from '../http/errors.js';
import type { RpcCall, RpcInvoker } from './rpc-invoker.js';

/**
 * Invocador que llama siempre con el JWT de la sesión técnica del backend (rol `worker`, V13), sea cual sea el
 * `accessToken` de la petición. Si Auth rechaza ese JWT (revocado o vencido) descarta la sesión y reintenta UNA vez.
 */
export function createTechnicalInvoker(rpc: RpcInvoker, accessToken: () => Promise<string>, invalidate: () => void): RpcInvoker {
  return (async <K extends string>(request: RpcCall<K>) => {
    try {
      return await rpc({ ...request, accessToken: await accessToken() });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'AUTHENTICATION_REQUIRED') throw error;
      invalidate();
      return rpc({ ...request, accessToken: await accessToken() });
    }
  }) as RpcInvoker;
}
