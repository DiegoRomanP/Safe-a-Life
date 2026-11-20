import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAddress } from './mapbox.js';

afterEach(() => vi.unstubAllGlobals());

describe('searchAddress', () => {
  it('consulta solo Perú dentro de Lima y redondea a tres decimales', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { full_address: 'Av. Arequipa, Miraflores', coordinates: { latitude: -12.119_456, longitude: -77.036_789 } } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchAddress('arequipa', undefined, 'pk.test');
    expect(result).toEqual([{ label: 'Av. Arequipa, Miraflores', latitude: '-12.119', longitude: '-77.037' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('country=pe');
    expect(url).toContain('bbox=-77.2%2C-12.3%2C-76.85%2C-11.8');
    expect(init.referrerPolicy).toBe('origin');
  });

  it('falla si Mapbox responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(searchAddress('x', undefined, 'pk.test')).rejects.toThrow('Mapbox 401');
  });
});
