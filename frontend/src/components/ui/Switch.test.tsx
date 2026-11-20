// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { click, render, setupRender } from '../../test/render.js';
import { ActionErrorNotice } from '../states/ActionErrorNotice.js';
import { Switch } from './Switch.js';
import { TableScroll } from './TableScroll.js';

setupRender();

function Harness() {
  const [on, setOn] = useState(true);
  return (
    <>
      <p id="etiqueta">Disponibilidad</p>
      <Switch checked={on} onChange={setOn} labelledBy="etiqueta" />
    </>
  );
}

describe('Switch', () => {
  it('es un role=switch nombrado por su etiqueta y dice el estado con texto al alternar', () => {
    const view = render(<Harness />);
    const button = view.querySelector('[role="switch"]')!;
    expect(button.getAttribute('aria-labelledby')).toBe('etiqueta');
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.textContent).toBe('Disponible');
    click(button);
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.textContent).toBe('No disponible');
  });
});

describe('TableScroll', () => {
  it('es una región nombrada y enfocable con teclado', () => {
    const region = render(<TableScroll label="Sedes"><table /></TableScroll>).querySelector('[role="region"]')!;
    expect(region.getAttribute('aria-label')).toBe('Sedes');
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('ActionErrorNotice', () => {
  it('sin mensaje deja la región viva vacía; con mensaje muestra la alerta', () => {
    expect(render(<ActionErrorNotice message={null} />).querySelector('[aria-live="assertive"]')?.childElementCount).toBe(0);
    expect(render(<ActionErrorNotice message="Sin conexión." />).textContent).toContain('Sin conexión.');
  });
});
