import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/http/errors.js';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createOutboxRpcGateway, parseClaimed } from './outbox-rpc-gateway.js';

const ROW = { outboxId: '60000000-0000-4000-8000-000000000001', kind: 'recuperacion', sealedPayload: 'v1.k1.a.b.c', attemptNo: 1, idempotencyKey: 'outbox-60000000-0000-4000-8000-000000000001', recipient: null };

function harness(reply: Record<string, unknown> | Error) {
  const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
  const rpc = (async ({ accessToken, name, args }: RpcCall<string>) => {
    calls.push({ accessToken, name, args });
    if (reply instanceof Error) throw reply;
    return reply;
  }) as RpcInvoker;
  return { calls, gateway: createOutboxRpcGateway(rpc, async () => 'jwt-tecnico') };
}

describe('parseClaimed (guard cerrado)', () => {
  it('acepta los seis campos', () => {
    expect(parseClaimed(ROW)).toEqual(ROW);
  });

  it.each([
    ['campo extra', { ...ROW, email: 'x' }], ['falta un campo', { ...ROW, idempotencyKey: undefined }],
    ['tipo desconocido', { ...ROW, kind: 'otro' }], ['attemptNo no numérico', { ...ROW, attemptNo: '1' }],
  ])('rechaza %s como fallo de persistencia', (_label, value) => {
    expect(() => parseClaimed(value)).toThrow(PersistenceError);
  });
});

describe('gateway del worker', () => {
  it('claim usa el JWT de la sesión técnica y valida cada elemento', async () => {
    const { gateway, calls } = harness({ kind: 'ok', items: [ROW] });

    expect(await gateway.claim(5)).toEqual([ROW]);
    expect(calls[0]).toEqual({ accessToken: 'jwt-tecnico', name: 'worker_claim_due_outbox', args: { p_limit: 5 } });
  });

  it('recordAttempt envía los argumentos p_* y la fecha ISO; un conflicto es «obsoleto», no error', async () => {
    const ok = harness({ kind: 'ok', status: 'enviado' });
    const stale = harness(new ApiError('STATE_CONFLICT'));
    const record = { outboxId: ROW.outboxId, attemptNo: 2, outcome: 'transitorio', httpStatus: 503, providerMessageId: null, nextAttemptAt: new Date('2026-10-13T12:10:00Z') } as const;

    expect(await ok.gateway.recordAttempt(record)).toBe(true);
    expect(ok.calls[0].args).toEqual({ p_outbox_id: ROW.outboxId, p_attempt_no: 2, p_outcome: 'transitorio', p_http_status: 503, p_provider_message_id: null, p_next_attempt_at: '2026-10-13T12:10:00.000Z' });
    expect(await stale.gateway.recordAttempt(record)).toBe(false);
  });

  it('otros errores del registro se propagan', async () => {
    const { gateway } = harness(new ApiError('SERVICE_UNAVAILABLE'));

    await expect(gateway.recordAttempt({ outboxId: ROW.outboxId, attemptNo: 1, outcome: 'ok', httpStatus: 200, providerMessageId: 'p', nextAttemptAt: null })).rejects.toBeInstanceOf(ApiError);
  });

  it('expire e ingestEvent validan sus respuestas', async () => {
    const expire = harness({ kind: 'ok', expired: 2, exhausted: 1 });
    const ingest = harness({ kind: 'ok', duplicate: true });

    expect(await expire.gateway.expire()).toEqual({ expired: 2, exhausted: 1 });
    expect(await ingest.gateway.ingestEvent({ eventId: 'e1', providerMessageId: 'p1', type: 'email.sent', occurredAt: new Date('2026-10-13T12:00:00Z') })).toEqual({ duplicate: true, matched: false });
    expect(ingest.calls[0].args).toEqual({ p_event_id: 'e1', p_provider_message_id: 'p1', p_type: 'email.sent', p_occurred_at: '2026-10-13T12:00:00.000Z' });
  });

  it('una respuesta con tipos equivocados es un fallo de persistencia', async () => {
    const { gateway } = harness({ kind: 'ok', expired: 'dos', exhausted: 1 });

    await expect(gateway.expire()).rejects.toBeInstanceOf(PersistenceError);
  });
});
