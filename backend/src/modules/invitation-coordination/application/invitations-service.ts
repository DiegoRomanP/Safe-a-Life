import { randomUUID } from 'node:crypto';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { generateActionToken, hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { RateLimiter } from '../../identity-institutions/application/identity.ports.js';
import type { NeedsRepository } from '../../need-records/application/needs.ports.js';
import { batchSize } from '../domain/batch-size.js';
import type { BatchSlot, InvitationsRepository, PageQuery, RetrySlot } from './invitations.ports.js';

const ACTION_LIMIT = 20;
const ACTION_WINDOW_SECONDS = 15 * 60;

export interface InvitationsServiceDependencies {
  readonly repository: InvitationsRepository;
  /** Lectura de la necesidad propia: da la meta con que se calcula el tamaño del lote. */
  readonly needs: Pick<NeedsRepository, 'get'>;
  readonly limiter: RateLimiter;
  /** Cifra el payload del correo con el id del outbox como AAD (solo secretos: los dos tokens). */
  readonly seal: (outboxId: string, payload: Readonly<{ token: string; rejectToken: string }>) => string;
  readonly newToken?: () => string;
  readonly newId?: () => string;
}

/**
 * Invitaciones (F6). El hospital, el donante y el rol salen de la sesión y de las tablas protegidas, nunca de la petición.
 * El lote y el reintento van en dos pasos (H1): la sesión del admin o del superadmin autoriza y la sesión técnica ejecuta con
 * los hashes y el payload que prepara este servicio; así nadie elige los hashes de los tokens de los donantes.
 */
export function createInvitationsService({
  repository, needs, limiter, seal, newToken = generateActionToken, newId = randomUUID,
}: InvitationsServiceDependencies) {
  /** Dos tokens (confirmar y rechazar) con su id de outbox y su payload sellado. Los tokens en claro no salen de aquí. */
  const prepare = () => {
    const confirmToken = newToken();
    const rejectToken = newToken();
    const outboxId = newId();
    return {
      outboxId, confirmHash: hashToken(confirmToken), rejectHash: hashToken(rejectToken),
      sealedPayload: seal(outboxId, { token: confirmToken, rejectToken }),
    };
  };

  return Object.freeze({
    listBatches: (accessToken: string, needId: string, query: PageQuery) => repository.listBatches(accessToken, needId, query),
    listNeedResponses: (accessToken: string, needId: string, query: PageQuery) => repository.listNeedResponses(accessToken, needId, query),

    /** Lote de invitaciones: la meta sale de la necesidad propia (404 si es ajena) y fija cuántos slots se preparan. */
    async requestBatch(accessToken: string, key: string, needId: string) {
      const need = await needs.get(accessToken, needId);
      const grant = await repository.authorizeBatch(accessToken, needId);
      const slots: BatchSlot[] = Array.from({ length: batchSize(need.targetConfirmations) }, () => ({ invitationId: newId(), ...prepare() }));
      return repository.requestBatch({ key, hash: fingerprint([['needId', needId]]) }, needId, grant, slots);
    },

    previewAction: (token: string) => repository.previewAction(hashToken(token)),

    /** Respuesta inicial por enlace: la acción la fija el token; el límite por IP frena el sondeo de tokens. */
    async respondByToken(token: string, key: string, ipSubject: string) {
      const decision = await limiter.consume('invitation-response:ip', ipSubject, ACTION_LIMIT, ACTION_WINDOW_SECONDS);
      if (!decision.allowed) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: decision.retryAfterSeconds });
      const tokenHash = hashToken(token);
      return repository.respondByToken(tokenHash, { key, hash: fingerprint([['tokenHash', tokenHash]]) });
    },

    listOwn: (accessToken: string, query: PageQuery) => repository.listOwn(accessToken, query),
    getOwn: (accessToken: string, invitationId: string) => repository.getOwn(accessToken, invitationId),
    listHistory: (accessToken: string, query: PageQuery) => repository.listHistory(accessToken, query),

    changeResponse: (accessToken: string, key: string, invitationId: string, response: 'confirmada' | 'rechazada') =>
      repository.changeResponse(accessToken, { key, hash: fingerprint([['invitationId', invitationId], ['response', response]]) }, invitationId, response),

    /** Reintento manual del superadmin (C-4): autoriza con su sesión (AAL2 y step-up) y rehace el envío con tokens nuevos. */
    async retryDelivery(accessToken: string, key: string, invitationId: string): Promise<void> {
      const grant = await repository.authorizeRetry(accessToken, invitationId);
      const slot: RetrySlot = prepare();
      await repository.retryDelivery({ key, hash: fingerprint([['invitationId', invitationId]]) }, invitationId, grant, slot);
    },
  });
}

export type InvitationsService = ReturnType<typeof createInvitationsService>;
