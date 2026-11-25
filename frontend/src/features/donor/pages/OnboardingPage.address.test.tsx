// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { stubDonorApi, type DonorApiStub } from '../../../test/donorApi.js';

// Con Mapbox activo no hay campos de latitud ni longitud: el usuario solo da su dirección.
vi.mock('../../../lib/mapbox.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/mapbox.js')>()),
  mapboxEnabled: true,
  searchAddress: vi.fn().mockResolvedValue([{ label: 'Miraflores, Lima, Perú', latitude: '-12.119', longitude: '-77.037' }]),
}));

setupRender();
let api: DonorApiStub;
beforeEach(() => { api = stubDonorApi(null); });

describe('DON-01 onboarding con dirección (Mapbox)', () => {
  it('no pide coordenadas, exige elegir una dirección y guarda su ubicación aproximada', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    const labels = [...view.querySelectorAll('label')].map((l) => l.textContent ?? '');
    expect(labels.some((t) => t.startsWith('Latitud') || t.startsWith('Longitud'))).toBe(false);

    const name = [...view.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Nombre'));
    type(view.querySelector(`#${CSS.escape(name?.getAttribute('for') ?? '')}`), 'Persona Demo');
    const select = view.querySelector('select') as HTMLSelectElement;
    act(() => { select.value = 'O_NEG'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Busca tu dirección y elige una opción.');

    const address = [...view.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Tu dirección'));
    type(view.querySelector(`#${CSS.escape(address?.getAttribute('for') ?? '')}`), 'miraflores');
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Buscar') ?? null);
    await settle();
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Miraflores, Lima, Perú') ?? null);
    click(view.querySelector('button[type="submit"]'));
    await settle();
    await settle();
    expect(api.profile).toMatchObject({ approximateLocation: { latitude: -12.119, longitude: -77.037 } });
  });

  it('marcar el punto en el mapa quita el error de dirección', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Busca tu dirección y elige una opción.');
    // En jsdom el contenedor no tiene tamaño: (0, 0) es el centro del mapa, dentro de Lima.
    click(view.querySelector('.leaflet-container'));
    expect(view.textContent).not.toContain('Busca tu dirección y elige una opción.');
    expect(view.textContent).toContain('Ubicación aproximada marcada en el mapa');
  });
});
