import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type { AtomicNeedDraftCommand } from '../application/create-need-draft.ports.js';
import { createNeedsRpcGateway, parseNeed, toDraftReply } from './needs-rpc-gateway.js';

const SITE = '22222222-2222-4222-8222-222222222201';
const NEED = {
  needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f', component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, confirmedIntentCount: 0,
  siteId: SITE, radiusKm: 10, urgency: 'Urgente', status: 'borrador', expiresAt: '2026-10-14T12:00:00.123456Z',
};
const OWNER = { actorId: '00000000-0000-4000-8000-0000000000d1', hospitalId: '10000000-0000-4000-8000-0000000000d1' };

function harness(rpcReply: Record<string, unknown> = { kind: 'ok', need: NEED }, rawReply: unknown = { kind: 'created', owner: OWNER, need: NEED }) {
  const rpcCalls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
  const rawCalls: Array<{ token: string; name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcInvoker = (async ({ accessToken, name, args }: RpcCall<string>) => { rpcCalls.push({ accessToken, name, args }); return rpcReply; }) as RpcInvoker;
  const raw = async (token: string, name: string, args: Readonly<Record<string, unknown>>) => { rawCalls.push({ token, name, args: { ...args } }); return rawReply; };
  return { rpcCalls, rawCalls, gateway: createNeedsRpcGateway({ rpc, raw }) };
}

describe('parseNeed (guard cerrado)', () => {
  it('acepta los diez campos y devuelve una copia congelada', () => {
    const need = parseNeed(NEED);

    expect(need).toEqual(NEED);
    expect(Object.isFrozen(need)).toBe(true);
  });

  it.each([
    ['campo extra', { ...NEED, hospitalId: 'x' }],
    ['campo ausente', { ...NEED, expiresAt: undefined }],
    ['tipo equivocado', { ...NEED, radiusKm: '10' }],
    ['estado fuera de la lista', { ...NEED, status: 'archivada' }],
    ['grupo fuera de la lista', { ...NEED, requiredBloodType: 'XX' }],
    ['componente distinto', { ...NEED, component: 'PLT' }],
    ['no es objeto', 'fila'],
  ])('rechaza %s como fallo de persistencia (nunca se serializa tal cual)', (_label, value) => {
    expect(() => parseNeed(value)).toThrow(PersistenceError);
  });
});

describe('repositorio', () => {
  it('list envía el estado y el cursor como argumentos p_* y devuelve la página validada', async () => {
    const { gateway, rpcCalls } = harness({ kind: 'ok', items: [NEED], next: { createdAt: '2026-10-13T10:00:00.000001Z', id: NEED.needId } });

    const page = await gateway.repository.list('jwt-1', { limit: 5, cursor: { createdAt: '2026-10-13T11:00:00.000000Z', id: NEED.needId }, status: 'activa' });

    expect(rpcCalls[0]).toMatchObject({ accessToken: 'jwt-1', name: 'list_own_needs', args: { p_limit: 5, p_status: 'activa', p_cursor_created_at: '2026-10-13T11:00:00.000000Z', p_cursor_id: NEED.needId } });
    expect(page.items).toEqual([NEED]);
    expect(page.next).toEqual({ createdAt: '2026-10-13T10:00:00.000001Z', id: NEED.needId });
  });

  it('list sin cursor ni filtro envía null', async () => {
    const { gateway, rpcCalls } = harness({ kind: 'ok', items: [], next: null });

    await gateway.repository.list('jwt-1', { limit: 20, cursor: null, status: null });

    expect(rpcCalls[0].args).toEqual({ p_limit: 20, p_status: null, p_cursor_created_at: null, p_cursor_id: null });
  });

  it('get y transition llaman a su RPC con el JWT del actor', async () => {
    const { gateway, rpcCalls } = harness();

    await gateway.repository.get('jwt-1', NEED.needId);
    await gateway.repository.transition('jwt-1', { key: 'clave-de-prueba-0001', hash: 'h'.repeat(64) }, NEED.needId, 'cerrada');

    expect(rpcCalls.map((call) => call.name)).toEqual(['get_own_need', 'transition_own_need']);
    expect(rpcCalls[1].args).toEqual({ p_key: 'clave-de-prueba-0001', p_hash: 'h'.repeat(64), p_id: NEED.needId, p_status: 'cerrada' });
    expect(rpcCalls.every((call) => call.accessToken === 'jwt-1')).toBe(true);
  });

  it('una necesidad con campos de más en la respuesta de la RPC es un fallo de persistencia', async () => {
    const { gateway } = harness({ kind: 'ok', need: { ...NEED, created_by: 'x' } });

    await expect(gateway.repository.get('jwt-1', NEED.needId)).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe('creación (request-scoped al JWT)', () => {
  const COMMAND: AtomicNeedDraftCommand = {
    input: { component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, siteId: SITE, radiusKm: 10, urgency: 'Urgente', expiresInHours: 12 },
    owner: OWNER,
    idempotency: { operation: 'createHospitalNeed', key: 'clave-de-prueba-0001', payloadHash: 'h'.repeat(64) },
  };

  it('llama a create_need_draft con el JWT del actor y los argumentos p_* (el siteId viaja como texto literal)', async () => {
    const { gateway, rawCalls } = harness();

    await gateway.draftGatewayFor('jwt-1').createDraft(COMMAND);

    expect(rawCalls).toEqual([{
      token: 'jwt-1', name: 'create_need_draft',
      args: { p_key: 'clave-de-prueba-0001', p_hash: 'h'.repeat(64), p_component: 'RBC', p_required_blood_type: 'O_NEG', p_target: 5, p_site_id: SITE, p_radius_km: 10, p_urgency: 'Urgente', p_expires_in_hours: 12 },
    }]);
  });

  it('no envía ningún campo que el cliente pueda usar para elegir propietario u hospital', async () => {
    const { gateway, rawCalls } = harness();

    await gateway.draftGatewayFor('jwt-1').createDraft(COMMAND);

    expect(Object.keys(rawCalls[0].args)).not.toEqual(expect.arrayContaining(['p_hospital_id', 'p_actor_id', 'p_owner']));
  });
});

describe('toDraftReply', () => {
  it('created pasa tal cual y replayed se desenvuelve a la respuesta original', () => {
    const created = { kind: 'created', owner: OWNER, need: NEED };

    expect(toDraftReply(created)).toBe(created);
    expect(toDraftReply({ kind: 'replayed', response: created })).toEqual({ kind: 'replayed', owner: OWNER, need: NEED });
  });

  it.each([
    ['unauthenticated', 'unauthenticated'], ['forbidden', 'forbidden'], ['mfa_required', 'forbidden'], ['site_unusable', 'site_unusable'],
    ['payload_conflict', 'payload_conflict'], ['in_progress', 'in_progress'],
    ['invalid', 'failed'], ['conflict', 'failed'], ['not_found', 'failed'], ['gone', 'failed'], ['step_up_required', 'failed'],
  ])('el kind %s se traduce a %s', (kind, expected) => {
    expect(toDraftReply({ kind })).toEqual({ kind: expected });
  });

  it.each([
    ['null', null], ['arreglo', []], ['sin kind', {}], ['kind desconocido', { kind: 'otra' }],
    ['replayed con respuesta que no es created', { kind: 'replayed', response: { kind: 'forbidden' } }],
    ['replayed sin respuesta', { kind: 'replayed' }],
  ])('una respuesta corrupta (%s) es un fallo de persistencia', (_label, value) => {
    expect(() => toDraftReply(value)).toThrow(PersistenceError);
  });
});
