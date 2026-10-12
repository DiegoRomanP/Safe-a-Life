import { callRpc } from '../../../shared/persistence/rpc.js';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { SupabaseFactory } from '../../../shared/persistence/supabase-client.js';
import type { ReadinessGateway } from '../http/health.router.js';

/** Llama a `api.readiness()` con la anon key (DEFINER #2 de la allowlist). */
export function createReadinessRpcGateway(factory: SupabaseFactory): ReadinessGateway {
  return {
    async schemaVersion() {
      const value = await callRpc(factory.anonymous(), 'readiness', {}, { timeoutMs: 2_000 });
      if (value !== null && typeof value !== 'string') throw new PersistenceError('shape');
      return value;
    },
  };
}
