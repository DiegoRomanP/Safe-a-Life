import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createSessionAdmissionRpcGateway } from './session-admission-rpc-gateway.js';

const TICKET = '00000000-0000-4000-8000-0000000000a1';

function harness(reply: Record<string, unknown>) {
  const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args' | 'okKinds'>> = [];
  const technical = (async ({ accessToken, name, args, okKinds }: RpcCall<string>) => { calls.push({ accessToken, name, args, okKinds }); return reply; }) as RpcInvoker;
  return { calls, gateway: createSessionAdmissionRpcGateway(technical) };
}

describe('gateway de admisión de sesión', () => {
  it('issueLoginTicket llama a issue_login_ticket por la sesión técnica y devuelve el ticketId', async () => {
    const { calls, gateway } = harness({ kind: 'ok', ticketId: TICKET });

    expect(await gateway.issueLoginTicket('a@example.test')).toBe(TICKET);
    expect(calls[0]).toMatchObject({ accessToken: null, name: 'issue_login_ticket', args: { p_email: 'a@example.test' }, okKinds: ['ok'] });
  });

  it('admitSession devuelve true con ok y false con conflict, con argumentos p_*', async () => {
    const ok = harness({ kind: 'ok' });
    const conflict = harness({ kind: 'conflict' });

    expect(await ok.gateway.admitSession(TICKET, 'u-1', 's-1')).toBe(true);
    expect(await conflict.gateway.admitSession(TICKET, 'u-1', 's-1')).toBe(false);
    expect(ok.calls[0]).toMatchObject({ accessToken: null, name: 'admit_session', args: { p_ticket_id: TICKET, p_user_id: 'u-1', p_session_id: 's-1' } });
  });

  it('valida con guards cerrados: campos de más o de menos son un fallo de persistencia', async () => {
    await expect(harness({ kind: 'ok' }).gateway.issueLoginTicket('a@example.test')).rejects.toBeInstanceOf(PersistenceError);
    await expect(harness({ kind: 'ok', ticketId: TICKET, extra: 1 }).gateway.issueLoginTicket('a@example.test')).rejects.toBeInstanceOf(PersistenceError);
    await expect(harness({ kind: 'ok', extra: 1 }).gateway.admitSession(TICKET, 'u', 's')).rejects.toBeInstanceOf(PersistenceError);
  });
});
