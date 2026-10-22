// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

// Token sintético armado en código: un literal largo junto a «token» lo marca
// gitleaks como secreto en el CI.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

function buttonByText(view: HTMLElement, text: string) {
  return [...view.querySelectorAll('button')].find((button) => button.textContent === text) ?? null;
}

describe('AUTH-02 paso 2: verificar correo', () => {
  it('sin token muestra «Enlace no disponible»', () => {
    expect(renderRoute('/verificar-correo').querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('abrir el enlace no verifica nada: hace falta pulsar el botón', () => {
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu correo');
    expect(view.querySelector('[aria-current="step"]')?.textContent).toContain('Verificar correo');
    expect(view.innerHTML).not.toContain(TOKEN);
    click(buttonByText(view, 'Verificar correo'));
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Correo verificado');
    expect(document.activeElement).toBe(heading);
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Ingresar');
  });
});

describe('AUTH-02 paso 2: enlace vencido', () => {
  it('pide registrarse otra vez, sin mencionar al hospital', () => {
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('Vuelve a registrarte con tu correo para recibir un nuevo enlace.');
    expect(view.textContent).not.toContain('hospital');
  });
});

describe('Confirmar cambio de correo', () => {
  it('confirma con un botón explícito y enfoca el resultado', () => {
    const view = renderRoute(`/cambiar-correo#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Confirma tu nuevo correo');
    click(buttonByText(view, 'Confirmar nuevo correo'));
    expect(document.activeElement?.textContent).toBe('Correo actualizado');
  });

  it('el enlace vencido pide una nueva solicitud desde la cuenta', () => {
    const view = renderRoute(`/cambiar-correo#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('Crea una nueva solicitud de cambio de correo desde tu cuenta.');
  });
});
