import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors.js';
import { PersistenceError } from './errors.js';
import { createRpcInvoker } from './rpc-invoker.js';
import type { SupabaseFactory } from './supabase-client.js';

function factoryReturning(data: unknown, status = 200): SupabaseFactory {
  const client = {
    rpc: () => ({
      abortSignal: async () => ({ data, error: status >= 400 ? { message: 'x' } : null, status }),
    }),
  };
  return { forUser: () => client as never, anonymous: () => client as never };
}

const call = { accessToken: 'jwt', name: 'f', args: {}, okKinds: ['created'] as const };

describe('createRpcInvoker', () => {
  it('devuelve la respuesta de éxito', async () => {
    const invoke = createRpcInvoker(factoryReturning({ kind: 'created', id: 1 }));

    expect(await invoke(call)).toEqual({ kind: 'created', id: 1 });
  });

  it('desenvuelve un replay y devuelve la respuesta original', async () => {
    const invoke = createRpcInvoker(factoryReturning({ kind: 'replayed', response: { kind: 'created', id: 7 } }));

    expect(await invoke(call)).toEqual({ kind: 'created', id: 7 });
  });

  it('traduce cada fallo al error público correspondiente', async () => {
    for (const [kind, code] of [['forbidden', 'ACCESS_DENIED'], ['payload_conflict', 'STATE_CONFLICT'], ['invalid', 'VALIDATION_FAILED'],
      ['mfa_required', 'MFA_REQUIRED'], ['step_up_required', 'STEP_UP_REQUIRED']] as const) {
      const failure = await createRpcInvoker(factoryReturning({ kind }))(call).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).code).toBe(code);
    }
  });

  it('rechaza respuestas corruptas o con kinds desconocidos como error de persistencia', async () => {
    for (const bad of [null, 'ok', { kind: 'otro' }, { kind: 'replayed', response: { kind: 'otro' } }]) {
      await expect(createRpcInvoker(factoryReturning(bad))(call)).rejects.toBeInstanceOf(PersistenceError);
    }
  });
});
