// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { registerHospitalApi } from '../../test/hospitalApi.js';
import { ApiError } from '../../lib/demoApi.js';
import { fetchCoverage } from './api.js';

const api = registerHospitalApi();
const NEED = 'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01';
const load = () => act(async () => { await fetchCoverage(NEED); });

describe('fetchCoverage', () => {
  it('acepta la cobertura válida y la pide por la ruta de la necesidad', async () => {
    const coverage = await fetchCoverage(NEED);
    expect(coverage).toEqual(api().coverage);
    expect(api().calls).toContain(`GET /hospitals/me/needs/${NEED}/coverage`);
  });

  it.each([
    ['un campo de más en la raíz', (c: Record<string, unknown>) => ({ ...c, donors: [] })],
    ['una posición individual en una celda', (c: Record<string, any>) => ({ ...c, cells: [{ ...c.cells[0], donorId: 'x' }] })],
    ['una distancia en un anillo', (c: Record<string, any>) => ({ ...c, rings: c.rings.map((r: object) => ({ ...r, distanceM: 1 })) })],
    ['un campo de más en la sede', (c: Record<string, any>) => ({ ...c, site: { ...c.site, name: 'x' } })],
    ['ningún grupo de anillos', (c: Record<string, any>) => ({ ...c, rings: [] })],
    ['más de cuatro grupos de anillos', (c: Record<string, any>) => ({ ...c, rings: Array.from({ length: 5 }, () => c.rings[0]) })],
    ['un grupo con 1 o 2 personas', (c: Record<string, any>) => ({ ...c, rings: [{ fromKm: 0, toKm: 10, count: 2 }] })],
    ['un total de 1 o 2 personas', (c: Record<string, any>) => ({ ...c, compatibleCount: 1 })],
    ['una celda con menos de 3 donantes', (c: Record<string, any>) => ({ ...c, cells: [{ ...c.cells[0], count: 2 }] })],
    ['un conteo negativo', (c: Record<string, any>) => ({ ...c, compatibleCount: -1 })],
  ])('rechaza %s', async (_label, mutate) => {
    api().coverage = mutate(structuredClone(api().coverage)) as never;
    await expect(load()).rejects.toBeInstanceOf(ApiError);
  });

  it('acepta null («menos de 3») en el total, el lote siguiente y los grupos, y el cero', async () => {
    api().coverage = { ...api().coverage, compatibleCount: null, nextBatchCount: null, rings: [{ fromKm: 0, toKm: 10, count: null }], cells: [] };
    await expect(fetchCoverage(NEED)).resolves.toMatchObject({ compatibleCount: null, rings: [{ count: null }] });
    api().coverage = { ...api().coverage, compatibleCount: 0, nextBatchCount: 0, rings: [{ fromKm: 0, toKm: 10, count: 0 }] };
    await expect(fetchCoverage(NEED)).resolves.toMatchObject({ compatibleCount: 0, rings: [{ count: 0 }] });
  });
});
