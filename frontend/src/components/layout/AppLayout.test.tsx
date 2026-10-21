// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { click, render, setupRender } from '../../test/render.js';
import { AppLayout } from './AppLayout.js';

setupRender();

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>inicio público</p> },
      {
        path: '/area',
        element: (
          <AppLayout
            navLabel="Cuenta"
            navItems={[
              { to: '/area/uno', label: 'Uno' },
              { to: '/area/dos', label: 'Dos' },
            ]}
            accountTitle="Cuenta personal"
            accountRole="Donante"
            initials="DP"
          />
        ),
        children: [
          { path: 'uno', element: <h1>Vista uno</h1> },
          { path: 'dos', element: <h1>Vista dos</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return { view: render(<RouterProvider router={router} />), router };
}

describe('AppLayout', () => {
  it('el primer enlace salta al contenido principal', () => {
    const { view } = mount('/area/uno');
    const skip = view.querySelector('a');
    expect(skip?.textContent).toBe('Saltar al contenido');
    expect(skip?.getAttribute('href')).toBe('#contenido');
    expect(view.querySelector('main#contenido h1')?.textContent).toBe('Vista uno');
  });

  it('marca la ruta activa con aria-current dentro de un nav con nombre', () => {
    const { view } = mount('/area/dos');
    const links = [...view.querySelectorAll('nav[aria-label="Cuenta"] a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([
      ['Uno', null],
      ['Dos', 'page'],
    ]);
  });

  it('muestra la cuenta y la etiqueta académica', () => {
    const { view } = mount('/area/uno');
    expect(view.querySelector('header')?.textContent).toContain('Prototipo académico');
    expect(view.querySelector('header')?.textContent).toContain('Cuenta personal');
  });

  it('«Cerrar sesión» vuelve al inicio público', () => {
    const { view, router } = mount('/area/uno');
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesión') ?? null);
    expect(router.state.location.pathname).toBe('/');
  });
});
