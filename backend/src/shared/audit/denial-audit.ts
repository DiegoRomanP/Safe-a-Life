import type { RpcInvoker } from '../persistence/rpc-invoker.js';

export type DenialKind = 'acceso' | 'conflicto' | 'limite';

/** Estado HTTP de una denegación auditable, o `undefined` si la respuesta no lo es. */
export function denialKindFor(status: number): DenialKind | undefined {
  if (status === 403) return 'acceso';
  if (status === 409) return 'conflicto';
  if (status === 429) return 'limite';
  return undefined;
}

/**
 * Registra en la auditoría una denegación a un actor autenticado (RNF-AUD-01). La operación es la ruta con sus parámetros sin
 * sustituir (`DELETE /api/v1/x/:id`): no lleva identificadores ni datos de la petición.
 */
export type DenialAuditor = (denial: Readonly<{ userId: string; kind: DenialKind; operation: string }>) => Promise<void>;

export function createDenialAuditor(technical: RpcInvoker): DenialAuditor {
  return async ({ userId, kind, operation }) => {
    await technical({
      accessToken: null, name: 'record_denial', okKinds: ['ok'],
      args: { p_actor_id: userId, p_kind: kind, p_operation: operation },
    });
  };
}
