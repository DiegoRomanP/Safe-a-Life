// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { Brand } from './Brand.js';

setupRender();

describe('Brand', () => {
  it('enlaza al inicio con el nombre como texto accesible', () => {
    const link = render(<MemoryRouter><Brand /></MemoryRouter>).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.textContent).toBe('+Save a Life');
    expect(link?.querySelector('[aria-hidden="true"]')?.textContent).toBe('+');
  });

  it('sobre fondo oscuro usa nombre y foco blancos', () => {
    const link = render(<MemoryRouter><Brand tone="dark" /></MemoryRouter>).querySelector('a');
    expect(link?.className).toContain('focus-visible:outline-white');
    expect(link?.querySelector('span:last-child')?.className).toContain('text-white');
  });

  it('sobre fondo claro mantiene el foco global', () => {
    const link = render(<MemoryRouter><Brand /></MemoryRouter>).querySelector('a');
    expect(link?.className).not.toContain('outline-white');
  });
});
