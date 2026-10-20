import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createPrivacyPurgeRpcGateway, createPrivacyRequestsRpcGateway, parseRequest } from './privacy-requests-rpc-gateway.js';

const REQUEST = { requestId: '90000000-0000-4000-8000-000000000001', type: 'correccion', requestedFields: ['email', 'name'], status: 'pendiente', createdAt: '2026-10-20T10:00:00.000000Z', updatedAt: '2026-10-20T10:00:00.000000Z' };
const HASH = 'a'.repeat(64);

function harness(reply: Record<string, unknown> | ((name: string) => Record<string, unknown>)) {
  const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
  const make = (label: string): RpcInvoker => (async ({ accessToken, name, args }: RpcCall<string>) => { calls.push({ accessToken, name: `${label}:${name}`, args }); return typeof reply === 'function' ? reply(name) : reply; }) as RpcInvoker;
  return { calls, repository: createPrivacyRequestsRpcGateway(make('usuario'), make('tecnica')), purge: createPrivacyPurgeRpcGateway(make('worker')) };
}

describe('guardas cerradas', () => {
  it('aceptan la proyección exacta y devuelven copias congeladas', () => {
    expect(parseRequest(REQUEST)).toEqual(REQUEST);
    expect(Object.isFrozen(parseRequest(REQUEST))).toBe(true);
    expect(parseRequest({ ...REQUEST, decisionReason: 'ok' }).decisionReason).toBe('ok');
  });

  it.each([
    ['campo extra (valor propuesto)', { ...REQUEST, proposedName: 'Ana' }],
    ['campo extra (donante)', { ...REQUEST, donorId: 'd' }],
    ['estado desconocido', { ...REQUEST, status: 'archivada' }],
    ['campo pedido desconocido', { ...REQUEST, requestedFields: ['phone'] }],
  ])('rechazan %s como fallo de persistencia', (_label, value) => {
    expect(() => parseRequest(value)).toThrow(PersistenceError);
  });
});

describe('repositorio', () => {
  it('el alta del donante usa su JWT y argumentos p_*', async () => {
    const { repository, calls } = harness({ kind: 'created', request: REQUEST });
    await repository.createOwn('jwt', { key: 'clave-solicitud-0001', hash: HASH }, { requestId: REQUEST.requestId, type: 'correccion', name: 'Ana', emailSealed: null, declaredBloodType: null });
    expect(calls[0]).toMatchObject({ accessToken: 'jwt', name: 'usuario:create_own_correction_request' });
    expect(calls[0]?.args).toMatchObject({ p_key: 'clave-solicitud-0001', p_hash: HASH, p_type: 'correccion', p_name: 'Ana', p_email_sealed: null });
  });

  it('el cierre de la ejecución va por la sesión técnica', async () => {
    const { repository, calls } = harness((name) => name === 'get_execution_subject' ? { kind: 'ok', type: 'eliminacion', donorId: 'd-1' } : { kind: 'ok' });
    expect(await repository.executionSubject('r-1')).toEqual({ type: 'eliminacion', donorId: 'd-1' });
    await repository.finishDeletion('r-1', HASH);
    await repository.failExecution('r-1');
    await repository.issueEmailChange('r-1', { tokenHash: HASH, sealedEmail: 's', outboxId: 'o', sealedPayload: 'p' });
    expect(calls.map((call) => call.name)).toEqual(['tecnica:get_execution_subject', 'tecnica:finish_deletion', 'tecnica:fail_correction_request', 'tecnica:issue_email_change']);
    expect(calls[1]?.args).toEqual({ p_request_id: 'r-1', p_subject_hmac: HASH });
  });

  it('la lectura contextual acepta el correo propuesto nulo y conserva el cifrado aparte', async () => {
    const { repository } = harness({ kind: 'ok', currentValues: { name: 'Ana' }, proposedValues: { email: null }, proposedEmailSealed: 'sellado' });
    expect(await repository.contextualData('jwt', 'r', 'g')).toEqual({ currentValues: { name: 'Ana' }, proposedValues: {}, proposedEmailSealed: 'sellado' });
  });

  it('rechaza un valor contextual de un campo desconocido', async () => {
    const { repository } = harness({ kind: 'ok', currentValues: { phone: '1' }, proposedValues: {} });
    await expect(repository.contextualData('jwt', 'r', 'g')).rejects.toThrow(PersistenceError);
  });

  it('ejecutar devuelve la solicitud y el siguiente paso', async () => {
    const { repository } = harness({ kind: 'ok', next: 'email', request: { ...REQUEST, status: 'en_ejecucion' } });
    expect((await repository.execute('jwt', { key: 'clave-ejecuta-0001', hash: HASH }, 'r', 'g')).next).toBe('email');
  });
});

describe('purga del worker', () => {
  it('lee el informe cerrado y lo entrega congelado', async () => {
    const { purge, calls } = harness({
      kind: 'ok', purged: { idempotencyRecords: 1, actionTokens: 0, rateLimitEvents: 0, accessGrants: 0, assistedSignups: 0 },
      failedRequests: 0, staleAccounts: ['u-1'], pendingDeletions: [{ requestId: 'r-1', donorId: 'd-1' }],
    });
    const report = await purge.purge();
    expect(report.staleAccounts).toEqual(['u-1']);
    expect(report.pendingDeletions).toEqual([{ requestId: 'r-1', donorId: 'd-1' }]);
    expect(calls[0]?.name).toBe('worker:worker_purge_expired');
  });

  it('un informe con claves de más es un fallo de persistencia', async () => {
    const { purge } = harness({ kind: 'ok', purged: {}, failedRequests: 0, staleAccounts: [], pendingDeletions: [] });
    await expect(purge.purge()).rejects.toThrow(PersistenceError);
  });
});
