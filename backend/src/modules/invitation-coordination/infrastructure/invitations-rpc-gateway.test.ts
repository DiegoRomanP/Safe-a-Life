import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createInvitationsRpcGateway, parseItem } from './invitations-rpc-gateway.js';

const ITEM = {
  invitationId: '50000000-0000-4000-8000-000000000001', hospitalName: 'H', publicSiteName: 'S', requiredBloodType: 'A_POS', urgency: 'Normal',
  instructions: 'i', expiresAt: '2026-10-02T18:00:00Z', validity: 'activa', delivery: 'entregada', response: 'sin_respuesta',
};

function harness(reply: Record<string, unknown>) {
  const calls: Array<RpcCall<string>> = [];
  const rpc = (async (call: RpcCall<string>) => { calls.push(call); return reply; }) as RpcInvoker;
  const technical = (async (call: RpcCall<string>) => { calls.push({ ...call, accessToken: 'tecnica' }); return reply; }) as RpcInvoker;
  return { calls, gateway: createInvitationsRpcGateway(rpc, technical) };
}

describe('parseItem (guard cerrado)', () => {
  it('acepta los diez campos del contrato', () => expect(parseItem(ITEM)).toEqual(ITEM));
  it.each([['hashes u otros campos', { ...ITEM, confirm_token_hash: 'x' }], ['valor fuera del catálogo', { ...ITEM, validity: 'otra' }], ['falta un campo', { ...ITEM, instructions: undefined }]])(
    'rechaza %s', (_label, value) => expect(() => parseItem(value)).toThrow(PersistenceError),
  );
});

describe('gateway de invitaciones', () => {
  it('el lote va con la sesión técnica y la concesión; no con la de la persona', async () => {
    const { calls, gateway } = harness({ kind: 'created', batchId: 'b', createdInvitationCount: 2, queuedEmailCount: 2 });
    await gateway.requestBatch({ key: 'k'.repeat(16), hash: 'h' }, 'need', { grantSecret: 'g' }, []);
    expect(calls[0]).toMatchObject({ accessToken: 'tecnica', name: 'request_invitation_batch', args: { p_need_id: 'need', p_grant: 'g', p_slots: [] } });
  });

  it('el historial traduce el cursor de SQL (changedAt, id numérico) al cursor común y de vuelta', async () => {
    const { calls, gateway } = harness({ kind: 'ok', items: [], next: { changedAt: '2026-10-01T18:20:00Z', id: 42 } });
    const page = await gateway.listHistory('jwt', { limit: 10, cursor: { createdAt: '2026-10-02T00:00:00Z', id: '7' } });
    expect(page.next).toEqual({ createdAt: '2026-10-01T18:20:00Z', id: '42' });
    expect(calls[0]?.args).toEqual({ p_limit: 10, p_cursor_changed_at: '2026-10-02T00:00:00Z', p_cursor_id: 7 });
  });

  it('el hospital ve una respuesta confirmada con nombre y grupo y las demás opacas; un campo extra es un fallo', async () => {
    const confirmed = { needDonorCode: 'ABCDEFGHJK', donorName: 'D', declaredBloodType: 'O_POS', response: 'confirmada', responseRecordedAt: 't' };
    const opaque = { needDonorCode: 'ABCDEFGHJM', validity: 'activa', delivery: 'pendiente', response: 'sin_respuesta' };
    const ok = harness({ kind: 'ok', confirmedIntentCount: 1, items: [confirmed, opaque], next: null });
    expect(await ok.gateway.listNeedResponses('jwt', 'need', { limit: 5, cursor: null })).toMatchObject({ confirmedIntentCount: 1, items: [confirmed, opaque] });
    const leaking = harness({ kind: 'ok', confirmedIntentCount: 1, items: [{ ...opaque, email: 'x@example.test' }], next: null });
    await expect(leaking.gateway.listNeedResponses('jwt', 'need', { limit: 5, cursor: null })).rejects.toBeInstanceOf(PersistenceError);
  });

  it('las rutas de token llaman con el hash y la sesión técnica', async () => {
    const { calls, gateway } = harness({ kind: 'ok', hospitalName: 'H', publicSiteName: 'S', intendedAction: 'confirmar', expiresAt: 't' });
    await gateway.previewAction('a'.repeat(64));
    expect(calls[0]).toMatchObject({ accessToken: 'tecnica', name: 'get_invitation_action_preview', args: { p_token_hash: 'a'.repeat(64) } });
  });
});

describe('cobertura agregada del hospital', () => {
  const COVERAGE = {
    kind: 'ok', site: { latitude: -12.046374, longitude: -77.042793 }, radiusKm: 10, compatibleCount: 6, nextBatchCount: 6,
    rings: [{ fromKm: 0, toKm: 10, count: 6 }],
    cells: [{ latitude: -12.065, longitude: -77.045, count: 4 }],
  };

  it('llama con la sesión de la persona (no la técnica) y solo con el id de la necesidad', async () => {
    const { calls, gateway } = harness(COVERAGE);
    const { kind: _kind, ...expected } = COVERAGE;
    await expect(gateway.getCoverage('jwt', 'need')).resolves.toEqual(expected);
    expect(calls[0]).toMatchObject({ accessToken: 'jwt', name: 'get_need_coverage', args: { p_need_id: 'need' } });
  });

  it('con menos de 3 candidatos acepta el total y los grupos como null («menos de 3»), nunca como un número', async () => {
    const { gateway } = harness({ ...COVERAGE, compatibleCount: null, nextBatchCount: null, rings: [{ fromKm: 0, toKm: 10, count: null }], cells: [] });
    await expect(gateway.getCoverage('jwt', 'need')).resolves.toMatchObject({ compatibleCount: null, nextBatchCount: null, rings: [{ count: null }] });
  });

  it.each([
    ['una posición individual en una celda', { ...COVERAGE, cells: [{ latitude: -12.065, longitude: -77.045, count: 4, donorId: 'x' }] }],
    ['un id o distancia en un anillo', { ...COVERAGE, rings: [{ fromKm: 0, toKm: 2.5, count: 5, distanceM: 120 }] }],
    ['un campo de más en la raíz', { ...COVERAGE, donors: [] }],
    ['un campo de más en la sede', { ...COVERAGE, site: { latitude: 1, longitude: 2, name: 'x' } }],
  ])('rechaza %s (forma cerrada)', async (_label, reply) => {
    const { gateway } = harness(reply);
    await expect(gateway.getCoverage('jwt', 'need')).rejects.toThrow(PersistenceError);
  });
});

