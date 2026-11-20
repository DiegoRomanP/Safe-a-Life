// @vitest-environment jsdom
import { vi, describe, expect, it } from 'vitest';
import { settle, setupRender } from '../../test/render.js';
import { renderRoute } from '../../test/renderRoute.js';
import { stubDonorApi } from '../../test/donorApi.js';

setupRender();

const navOf = (view: HTMLElement) => view.querySelector('nav[aria-label="Cuenta del donante"]');

// RF-IAM-01: sin perfil completo el donante solo ve el onboarding.
describe('DonorLayout: perfil obligatorio antes de explorar', () => {
  it.each(['/donante', '/donante/invitaciones', '/donante/perfil', '/donante/historial', '/donante/solicitudes'])(
    'sin perfil, %s lleva a la pantalla única de bienvenida, sin navegación', async (path) => {
      stubDonorApi(null);
      const view = renderRoute(path);
      await settle();
      expect(view.querySelector('h1')?.textContent).toBe('Te damos la bienvenida');
      expect(navOf(view)).toBeNull();
    },
  );

  it('con perfil, muestra la navegación completa y la bienvenida ya no aplica', async () => {
    stubDonorApi();
    const view = renderRoute('/donante/bienvenida');
    await settle();
    expect(navOf(view)?.querySelectorAll('a')).toHaveLength(4);
    expect(view.querySelector('main h1')?.textContent).toBe('Mis invitaciones');
    expect(view.textContent).toContain('Perfil completo');
  });

  it('si no se puede consultar el perfil, el área no se abre y ofrece reintentar', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({ error: { code: 'X' } }) }));
    const view = renderRoute('/donante/historial');
    await settle();
    expect(view.textContent).toContain('No pudimos cargar la información');
    expect(navOf(view)).toBeNull();
  });
});
