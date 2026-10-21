// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { useFragmentToken } from './useFragmentToken.js';

setupRender();

const TOKEN = 'tok_sintetico_'.padEnd(40, 'x');

function Probe() {
  const { token, malformed } = useFragmentToken();
  const location = useLocation();
  return (
    <output data-token={token ?? ''} data-malformed={String(malformed)} data-hash={location.hash}>
      {/* El token nunca se pinta: solo se expone a la prueba por atributo. */}
      listo
    </output>
  );
}

function mount(url: string) {
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], { initialEntries: [url] });
  const view = render(<RouterProvider router={router} />);
  return { output: view.querySelector('output'), router };
}

describe('useFragmentToken', () => {
  it('lee el token del fragmento y lo borra de la dirección', () => {
    const { output, router } = mount(`/activar-cuenta#${TOKEN}`);
    expect(output?.dataset.token).toBe(TOKEN);
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.pathname).toBe('/activar-cuenta');
  });

  it('conserva el token en memoria después de limpiar la dirección', () => {
    const { output } = mount(`/activar-cuenta#${TOKEN}`);
    expect(output?.dataset.hash).toBe('');
    expect(output?.dataset.token).toBe(TOKEN);
  });

  it('sin fragmento no hay token ni error', () => {
    const { output } = mount('/activar-cuenta');
    expect(output?.dataset.token).toBe('');
    expect(output?.dataset.malformed).toBe('false');
  });

  it('un fragmento con forma inválida se descarta y se marca', () => {
    const { output, router } = mount('/activar-cuenta#<script>');
    expect(output?.dataset.token).toBe('');
    expect(output?.dataset.malformed).toBe('true');
    expect(router.state.location.hash).toBe('');
  });
});
