import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import { createTechnicalInvoker } from './technical-rpc.js';
import type { RpcCall, RpcInvoker } from './rpc-invoker.js';

function harness(fail: (token: string) => boolean) {
  const calls: Array<string | null> = [];
  let issued = 0;
  let invalidated = 0;
  const rpc = (async ({ accessToken }: RpcCall<string>) => {
    calls.push(accessToken);
    if (fail(accessToken as string)) throw new ApiError('AUTHENTICATION_REQUIRED');
    return { kind: 'ok' };
  }) as RpcInvoker;
  const invoker = createTechnicalInvoker(rpc, async () => `jwt-${++issued}`, () => { invalidated += 1; });
  return { invoker, calls, invalidated: () => invalidated };
}

describe('invocador técnico', () => {
  it('siempre usa el JWT de la sesión técnica y descarta el de la petición', async () => {
    const { invoker, calls } = harness(() => false);

    await invoker({ accessToken: 'jwt-de-un-usuario', name: 'x', args: {}, okKinds: ['ok'] });

    expect(calls).toEqual(['jwt-1']);
  });

  it('ante un 401 descarta la sesión y reintenta una sola vez con una nueva', async () => {
    const { invoker, calls, invalidated } = harness((token) => token === 'jwt-1');

    await expect(invoker({ accessToken: null, name: 'x', args: {}, okKinds: ['ok'] })).resolves.toEqual({ kind: 'ok' });
    expect(calls).toEqual(['jwt-1', 'jwt-2']);
    expect(invalidated()).toBe(1);
  });

  it('si el reintento también falla el error se propaga (sin bucle) y otros errores no se reintentan', async () => {
    const always = harness(() => true);

    await expect(always.invoker({ accessToken: null, name: 'x', args: {}, okKinds: ['ok'] })).rejects.toBeInstanceOf(ApiError);
    expect(always.calls).toHaveLength(2);
  });
});
