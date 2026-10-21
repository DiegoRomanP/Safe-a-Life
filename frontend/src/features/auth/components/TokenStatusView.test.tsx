// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../../test/render.js';
import { TokenStatusView, type TokenStatus } from './TokenStatusView.js';

setupRender();

function view(status: TokenStatus) {
  return render(
    <MemoryRouter>
      <TokenStatusView status={status} validContent={<p>contenido válido</p>} />
    </MemoryRouter>,
  );
}

describe('TokenStatusView', () => {
  it('en estado válido muestra el contenido de la vista', () => {
    expect(view('valid').textContent).toBe('contenido válido');
  });

  it.each([
    ['used', 'Enlace ya utilizado', 'Usada', '/ingresar'],
    ['expired', 'Enlace vencido', 'Vencida', '/'],
    ['invalid', 'Enlace no disponible', 'No disponible', '/'],
  ] as const)('estado %s: título, etiqueta y salida', (status, title, badge, href) => {
    const container = view(status);
    expect(container.querySelector('h1')?.textContent).toBe(title);
    expect(container.querySelector('span')?.textContent).toBe(badge);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(href);
  });
});
