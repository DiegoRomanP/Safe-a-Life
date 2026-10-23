import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../api/client.js';
import { hospital, paged, privacyRequest, sites } from './httpGateway.js';

vi.mock('../../api/client.js', () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe('contratos de superadmin', () => {
  it('rechaza una respuesta parcial en lugar de sustituirla por fixtures', () => {
    expect(() => hospital({ hospitalId: 'demo', publicName: 'Hospital' })).toThrow();
  });
  it('conserva la falta de autorización de un hospital nuevo', () => {
    const result = hospital({ hospitalId: 'h1', publicName: 'Hospital sintético', legalName: 'Razón sintética', isAuthorized: false, createdAt: '2026-10-22T10:00:00Z' });
    expect(result.isAuthorized).toBe(false);
  });
  it('conserva cursor opaco y no presume que una página sea la lista completa', () => {
    const parse = paged(hospital);
    expect(parse({ items: [], pagination: { nextCursor: 'opaque-next' } }).pagination.nextCursor).toBe('opaque-next');
    expect(() => parse({ items: [] })).toThrow();
  });
  it('no confunde aprobación de sede con disponibilidad', () => {
    expect(sites({ items: [{ siteId: 's1', hospitalId: 'h1', publicName: 'Sede', publicAddress: 'Dirección sintética', coordinates: { latitude: -12.1, longitude: -77.1 }, publicInstructions: null, isActive: false, isApproved: true }] })[0]).toMatchObject({ isActive: false, isApproved: true });
  });
  it('admite eliminación sin usarla como campo de acceso contextual', () => {
    expect(privacyRequest({ requestId: 'r1', type: 'eliminacion', requestedFields: ['deletion'], status: 'pendiente', createdAt: '2026-10-22T10:00:00Z' }).requestedFields).toEqual(['deletion']);
  });
  it('no consulta red durante el análisis de respuestas', () => {
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

