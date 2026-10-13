import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import type { ManualNeedStatus } from '../domain/need-state.js';
import type { ListNeedsQuery, NeedsRepository } from './needs.ports.js';

/**
 * Casos de uso de lectura y transición de necesidades propias. La transición calcula el hash canónico
 * del payload (mismo orden y serialización que `app.fingerprint`, que lo recalcula en SQL) y delega en
 * una sola RPC atómica; la matriz C-8 y el vencimiento los decide SQL bajo bloqueo de fila.
 */
export function createNeedsService(repository: NeedsRepository) {
  return Object.freeze({
    list: (token: string, query: ListNeedsQuery) => repository.list(token, query),

    get: (token: string, needId: string) => repository.get(token, needId),

    // La RPC recibe el UUID como `uuid` (minúsculas): el hash se calcula sobre esa misma forma.
    transition: (token: string, key: string, needId: string, status: ManualNeedStatus) =>
      repository.transition(
        token,
        { key, hash: fingerprint([['needId', needId.toLowerCase()], ['status', status]]) },
        needId,
        status,
      ),
  });
}

export type NeedsService = ReturnType<typeof createNeedsService>;
