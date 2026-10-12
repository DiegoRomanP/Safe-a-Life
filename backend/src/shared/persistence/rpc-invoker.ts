import { callRpc } from './rpc.js';
import { mapFailureToApiError, parseRpcReply, type RpcReply } from './rpc-reply.js';
import type { SupabaseFactory } from './supabase-client.js';

export interface RpcCall<K extends string> {
  /** JWT del usuario, o `null` para llamar con la anon key. */
  readonly accessToken: string | null;
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  /** `kind` de éxito de la operación. `replayed` se acepta siempre en operaciones idempotentes. */
  readonly okKinds: readonly K[];
}

/**
 * Ejecuta una RPC, valida el `kind` y traduce cualquier fallo a un ApiError.
 * Un replay idempotente se desenvuelve: se devuelve la respuesta original.
 */
export type RpcInvoker = <K extends string>(call: RpcCall<K>) => Promise<RpcReply<K>>;

export function createRpcInvoker(factory: SupabaseFactory): RpcInvoker {
  return async <K extends string>({ accessToken, name, args, okKinds }: RpcCall<K>): Promise<RpcReply<K>> => {
    const client = accessToken ? factory.forUser(accessToken) : factory.anonymous();
    const allowed = [...okKinds, 'replayed'] as const;
    let reply = parseRpcReply(await callRpc(client, name, args), allowed) as RpcReply<string>;

    if (reply.kind === 'replayed') {
      reply = parseRpcReply(reply.response, okKinds) as RpcReply<string>;
    }
    if (!(okKinds as readonly string[]).includes(reply.kind)) throw mapFailureToApiError(reply.kind);
    return reply as RpcReply<K>;
  };
}
