import { asString, closedRecord } from '../../../shared/persistence/guards.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type { SessionAdmission } from '../application/identity.ports.js';

/** Adaptador RPC de la barrera de sesión (ADR-007): solo la sesión técnica ejecuta estas RPC. */
export function createSessionAdmissionRpcGateway(technical: RpcInvoker): SessionAdmission {
  return {
    async issueLoginTicket(email) {
      const reply = await technical({ accessToken: null, name: 'issue_login_ticket', okKinds: ['ok'], args: { p_email: email } });
      return asString(closedRecord(reply, ['kind', 'ticketId']).ticketId);
    },

    async admitSession(ticketId, userId, sessionId) {
      const reply = await technical({
        accessToken: null, name: 'admit_session', okKinds: ['ok', 'conflict'],
        args: { p_ticket_id: ticketId, p_user_id: userId, p_session_id: sessionId },
      });
      closedRecord(reply, ['kind']);
      return reply.kind === 'ok';
    },
  };
}
