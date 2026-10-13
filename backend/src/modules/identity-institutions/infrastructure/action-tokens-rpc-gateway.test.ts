import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createActionTokensRpcGateway } from './action-tokens-rpc-gateway.js';

function harness(reply: Record<string, unknown>) {
  const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
  const rpc = (async ({ accessToken, name, args }: RpcCall<string>) => { calls.push({ accessToken, name, args }); return reply; }) as RpcInvoker;
  return { calls, gateway: createActionTokensRpcGateway(rpc) };
}

describe('gateway de tokens de acción', () => {
  it('las operaciones públicas usan la anon key (accessToken nulo) y las de sesión el JWT', async () => {
    const preview = harness({ kind: 'ok', hospitalName: 'H', expiresAt: '2026-10-16T12:00:00.000000Z', email: 'a@example.test' });
    const invite = harness({ kind: 'ok' });

    await preview.gateway.adminInvitationPreview('h'.repeat(64));
    await invite.gateway.inviteAdmin('jwt-1', { key: 'clave-de-prueba-0001', hash: 'x'.repeat(64) },
      { email: 'a@example.test', hospitalId: '11111111-1111-4111-8111-111111111101', tokenHash: 'h'.repeat(64), outboxId: 'o', sealed: 's' });

    expect(preview.calls[0]).toEqual({ accessToken: null, name: 'get_admin_invitation_preview', args: { p_token_hash: 'h'.repeat(64) } });
    expect(invite.calls[0].accessToken).toBe('jwt-1');
    expect(invite.calls[0].args).toMatchObject({ p_key: 'clave-de-prueba-0001', p_email: 'a@example.test', p_token_hash: 'h'.repeat(64) });
  });

  it('valida con guards cerrados: una respuesta con campos de más o de menos es un fallo de persistencia', async () => {
    await expect(harness({ kind: 'ok', hospitalName: 'H', expiresAt: 'x' }).gateway.adminInvitationPreview('h'.repeat(64))).rejects.toBeInstanceOf(PersistenceError);
    await expect(harness({ kind: 'ok', userId: 'u', extra: 1 }).gateway.consumePasswordReset('h'.repeat(64))).rejects.toBeInstanceOf(PersistenceError);
    await expect(harness({ kind: 'created' }).gateway.linkAdminAccount('jwt', { key: 'k'.repeat(16), hash: 'x' }, 'h'.repeat(64))).rejects.toBeInstanceOf(PersistenceError);
  });

  it('consumePasswordReset y requestRecovery llaman a sus RPC con argumentos p_*', async () => {
    const consume = harness({ kind: 'ok', userId: '00000000-0000-4000-8000-0000000000f2' });
    const recovery = harness({ kind: 'ok' });

    expect(await consume.gateway.consumePasswordReset('h'.repeat(64))).toEqual({ userId: '00000000-0000-4000-8000-0000000000f2' });
    await recovery.gateway.requestRecovery({ email: 'a@example.test', tokenHash: 'h'.repeat(64), outboxId: 'o', sealed: 's' });

    expect(consume.calls[0]).toEqual({ accessToken: null, name: 'consume_password_reset', args: { p_token_hash: 'h'.repeat(64) } });
    expect(recovery.calls[0]).toMatchObject({ accessToken: null, name: 'request_password_recovery', args: { p_email: 'a@example.test', p_outbox_id: 'o', p_sealed: 's' } });
  });
});
