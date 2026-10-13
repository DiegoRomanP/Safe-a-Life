import { describe, expect, it } from 'vitest';
import type { RpcCall, RpcInvoker } from '../persistence/rpc-invoker.js';
import { createDenialAuditor, denialKindFor } from './denial-audit.js';

describe('denialKindFor', () => {
  it('solo 403, 409 y 429 son denegaciones auditables', () => {
    expect([403, 409, 429].map(denialKindFor)).toEqual(['acceso', 'conflicto', 'limite']);
    for (const status of [200, 204, 400, 401, 404, 410, 422, 500, 503]) expect(denialKindFor(status)).toBeUndefined();
  });
});

describe('createDenialAuditor', () => {
  it('llama a record_denial con la sesión técnica y solo actor, tipo y ruta', async () => {
    const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
    const invoker = (async ({ accessToken, name, args }: RpcCall<string>) => { calls.push({ accessToken, name, args }); return { kind: 'ok' }; }) as RpcInvoker;

    await createDenialAuditor(invoker)({ userId: 'u-1', kind: 'acceso', operation: 'GET /api/v1/x/:id' });

    expect(calls).toEqual([{ accessToken: null, name: 'record_denial', args: { p_actor_id: 'u-1', p_kind: 'acceso', p_operation: 'GET /api/v1/x/:id' } }]);
  });
});
