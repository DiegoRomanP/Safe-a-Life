import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createInstitutionsRpcGateway, parseHospital, parseMembership, parseSite } from './institutions-rpc-gateway.js';

const HOSPITAL = {
  hospitalId: 'h1', publicName: 'Hospital', legalName: 'Hospital S.A.', isAuthorized: true, createdAt: '2026-10-12T00:00:00.000000Z',
};
const SITE = {
  siteId: 's1', hospitalId: 'h1', publicName: 'Sede', publicAddress: 'Lima', coordinates: { latitude: -12.04, longitude: -77.04 },
  publicInstructions: null, isActive: true, isApproved: true,
};

describe('guards cerrados de las proyecciones RPC', () => {
  it('aceptan la forma exacta', () => {
    expect(parseHospital(HOSPITAL)).toEqual(HOSPITAL);
    expect(parseSite(SITE)).toEqual(SITE);
    expect(parseMembership({ membershipId: 'm1', hospitalId: 'h1', role: 'admin_hospitalario', status: 'revocada', emailHint: 'a***@x.test' }).status).toBe('revocada');
  });

  it('rechazan claves de más, de menos o de otro tipo con un fallo de persistencia (500)', () => {
    const bad: Array<() => unknown> = [
      () => parseHospital({ ...HOSPITAL, extra: 'x' }),
      () => parseHospital({ ...HOSPITAL, legalName: undefined }),
      () => parseHospital({ ...HOSPITAL, isAuthorized: 'true' }),
      () => parseHospital(null),
      () => parseHospital([HOSPITAL]),
      () => parseSite({ ...SITE, coordinates: { latitude: -12, longitude: '-77' } }),
      () => parseSite({ ...SITE, coordinates: { latitude: -12, longitude: -77, altitude: 1 } }),
      () => parseMembership({ membershipId: 'm1', hospitalId: 'h1', role: 'superadmin', status: 'activa', emailHint: 'x' }),
      () => parseMembership({ membershipId: 'm1', hospitalId: 'h1', role: 'admin_hospitalario', status: 'otro', emailHint: 'x' }),
    ];
    for (const attempt of bad) expect(attempt).toThrowError(PersistenceError);
  });
});

describe('createInstitutionsRpcGateway', () => {
  const rpcReturning = (reply: Record<string, unknown>): { rpc: RpcInvoker; calls: Array<{ name: string; args: Record<string, unknown> }> } => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = (async ({ name, args }) => { calls.push({ name, args: { ...args } }); return reply; }) as RpcInvoker;
    return { rpc, calls };
  };

  it('traduce el cursor a argumentos p_* y devuelve la siguiente posición', async () => {
    const { rpc, calls } = rpcReturning({ kind: 'ok', items: [HOSPITAL], next: { createdAt: '2026-10-12T00:00:00.000000Z', id: 'h1' } });

    const page = await createInstitutionsRpcGateway(rpc).listHospitals('t', { limit: 5, cursor: { createdAt: 'c', id: 'i' } });

    expect(calls[0]).toEqual({ name: 'list_hospitals', args: { p_limit: 5, p_cursor_created_at: 'c', p_cursor_id: 'i' } });
    expect(page.items).toEqual([HOSPITAL]);
    expect(page.next).toEqual({ createdAt: '2026-10-12T00:00:00.000000Z', id: 'h1' });
  });

  it('una fila con forma inesperada dentro de la página es un fallo de persistencia', async () => {
    const { rpc } = rpcReturning({ kind: 'ok', items: [{ ...HOSPITAL, secreto: 'x' }], next: null });

    await expect(createInstitutionsRpcGateway(rpc).listHospitals('t', { limit: 5, cursor: null })).rejects.toBeInstanceOf(PersistenceError);
  });

  it('listOwnSites pagina por id de sede', async () => {
    const { rpc, calls } = rpcReturning({ kind: 'ok', items: [{ siteId: 's1', publicName: 'Sede' }], next: 's1' });

    const page = await createInstitutionsRpcGateway(rpc).listOwnSites('t', { limit: 1, afterSiteId: null });

    expect(calls[0].args).toEqual({ p_limit: 1, p_cursor_site_id: null });
    expect(page.next).toEqual({ createdAt: '-', id: 's1' });
  });

  it('los campos opcionales ausentes viajan como null', async () => {
    const { rpc, calls } = rpcReturning({ kind: 'ok', site: SITE });

    await createInstitutionsRpcGateway(rpc).updateHospitalSite('t', { key: 'k', hash: 'h' }, 's1', { isActive: false });

    expect(calls[0].args).toMatchObject({
      p_public_name: null, p_public_address: null, p_latitude: null, p_longitude: null,
      p_public_instructions: null, p_is_active: false, p_is_approved: null,
    });
  });
});
