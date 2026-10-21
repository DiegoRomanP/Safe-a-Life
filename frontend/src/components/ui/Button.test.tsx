// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, render, setupRender } from '../../test/render.js';
import { Button } from './Button.js';

setupRender();

describe('Button', () => {
  it('es un botón de tipo button por defecto para no enviar formularios por accidente', () => {
    const button = render(<Button>Guardar cambios</Button>).querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.textContent).toBe('Guardar cambios');
  });

  it('respeta type="submit" cuando se pide', () => {
    const button = render(<Button type="submit">Enviar</Button>).querySelector('button');
    expect(button?.getAttribute('type')).toBe('submit');
  });

  it.each([
    ['primary', 'bg-brand'],
    ['secondary', 'border-petrol'],
    ['ghost', 'border-line'],
    ['danger', 'border-danger'],
  ] as const)('aplica la variante %s', (variant, expected) => {
    const button = render(<Button variant={variant}>Acción</Button>).querySelector('button');
    expect(button?.className).toContain(expected);
    expect(button?.className).toContain('min-h-11');
  });

  it('llama a onClick al pulsarlo', () => {
    const onClick = vi.fn();
    click(render(<Button onClick={onClick}>Ver detalle</Button>).querySelector('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no llama a onClick cuando está deshabilitado', () => {
    const onClick = vi.fn();
    click(render(<Button disabled onClick={onClick}>Cancelar</Button>).querySelector('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ocupa todo el ancho con fullWidth', () => {
    const button = render(<Button fullWidth>Ingresar</Button>).querySelector('button');
    expect(button?.className).toContain('w-full');
  });
});
