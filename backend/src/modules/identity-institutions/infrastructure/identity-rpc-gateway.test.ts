import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { SupabaseFactory } from '../../../shared/persistence/supabase-client.js';
import { createIdentityGateways } from './identity-rpc-gateway.js';

type Reply = { data: unknown; error: unknown; status: number };

function harness(replies: Reply[]) {
  const calls: Array<{ token: string | null; name: string }> = [];
  const client = (token: string | null) => ({
    rpc: (name: string) => {
      calls.push({ token, name });
      const reply = replies.shift() ?? { data: null, error: { message: 'sin respuesta' }, status: 500 };
      return { abortSignal: async () => reply };
    },
  }) as unknown as SupabaseClient;
  const factory: SupabaseFactory = { forUser: (token) => client(token), anonymous: () => client(null) };
  let session = 0;
  const technical = { accessToken: async () => `tecnica-${session}`, invalidate: () => { session += 1; } };
  return { calls, gateways: createIdentityGateways(factory, technical) };
}

const ALLOWED: Reply = { data: { allowed: true, retryAfterSeconds: 0 }, error: null, status: 200 };

describe('gateways de identidad: rate limit e idempotencia pública (M1, L3)', () => {
  it('consume_rate_limit se llama con la sesión técnica, nunca con la anon key', async () => {
    const { calls, gateways } = harness([ALLOWED]);

    expect(await gateways.limiter.consume('login:ip', 'a'.repeat(64), 10, 900)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(calls).toEqual([{ token: 'tecnica-0', name: 'consume_rate_limit' }]);
  });

  it('record_public_idempotency se llama con la sesión técnica', async () => {
    const { calls, gateways } = harness([{ data: { kind: 'ok' }, error: null, status: 200 }]);

    expect(await gateways.publicKeys.record(`email:${'a'.repeat(64)}`, 'createSession', 'clave-publica-0001', 'b'.repeat(64))).toBe('ok');
    expect(calls).toEqual([{ token: 'tecnica-0', name: 'record_public_idempotency' }]);
  });

  it('si el JWT técnico es rechazado, descarta la sesión y reintenta una vez', async () => {
    const { calls, gateways } = harness([{ data: null, error: { message: 'jwt expired' }, status: 401 }, ALLOWED]);

    await gateways.limiter.consume('login:ip', 'a'.repeat(64), 10, 900);
    expect(calls.map((call) => call.token)).toEqual(['tecnica-0', 'tecnica-1']);
  });
});
