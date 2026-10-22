import { PersistenceError } from '../../../shared/persistence/errors.js';
import { asNullableString, asNumber, asString, closedRecord } from '../../../shared/persistence/guards.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type { ActionTokensRepository } from '../application/action-tokens.ports.js';

/**
 * Adaptador RPC de tokens de acción: nombres de función SQL y argumentos `p_*` viven solo aquí. `rpc` llama con el
 * JWT del usuario (invitar, vincular); `technical` con el de la sesión técnica (vista previa, recuperación, reset).
 */
export function createActionTokensRpcGateway(rpc: RpcInvoker, technical: RpcInvoker): ActionTokensRepository {
  return {
    async inviteAdmin(accessToken, { key, hash }, command) {
      await rpc({
        accessToken, name: 'invite_hospital_admin', okKinds: ['ok'],
        args: {
          p_key: key, p_hash: hash, p_email: command.email, p_hospital_id: command.hospitalId,
          p_token_hash: command.tokenHash, p_outbox_id: command.outboxId, p_sealed: command.sealed,
        },
      });
    },

    async adminInvitationPreview(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'get_admin_invitation_preview', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      const row = closedRecord(reply, ['kind', 'hospitalName', 'expiresAt', 'email', 'orphanUserId']);
      return Object.freeze({
        hospitalName: asString(row.hospitalName), expiresAt: asString(row.expiresAt), email: asString(row.email),
        orphanUserId: asNullableString(row.orphanUserId),
      });
    },

    async linkAdminAccount(accessToken, { key, hash }, tokenHash) {
      const reply = await rpc({
        accessToken, name: 'link_admin_account', okKinds: ['created'],
        args: { p_token_hash: tokenHash, p_key: key, p_hash: hash },
      });
      const row = closedRecord(reply, ['kind', 'hospitalName']);
      return Object.freeze({ hospitalName: asString(row.hospitalName) });
    },

    async requestRecovery(command) {
      await technical({
        accessToken: null, name: 'request_password_recovery', okKinds: ['ok'],
        args: {
          p_email: command.email, p_token_hash: command.tokenHash, p_outbox_id: command.outboxId, p_sealed: command.sealed,
          p_actor_ref: command.actorRef, p_key: command.key, p_hash: command.hash,
        },
      });
    },

    async consumePasswordReset(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'consume_password_reset', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      const row = closedRecord(reply, ['kind', 'userId', 'generation']);
      const generation = asNumber(row.generation);
      if (!Number.isInteger(generation) || generation < 1) throw new PersistenceError('shape');
      return Object.freeze({ userId: asString(row.userId), generation });
    },

    async closeSessionBarrier(userId, generation) {
      const reply = await technical({
        accessToken: null, name: 'close_session_barrier', okKinds: ['ok', 'conflict'], args: { p_user_id: userId, p_generation: generation },
      });
      closedRecord(reply, ['kind']);
      return reply.kind;
    },
  };
}
