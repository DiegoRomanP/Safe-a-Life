// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, render, settle, setupRender, type } from '../../test/render.js';
import { AddressSearch } from './AddressSearch.js';

setupRender();

describe('AddressSearch', () => {
  it('no se muestra sin token', () => {
    const view = render(<AddressSearch enabled={false} onSelect={vi.fn()} />);
    expect(view.innerHTML).toBe('');
  });

  it('busca, lista resultados y rellena la ubicación redondeada', async () => {
    const onSelect = vi.fn();
    const search = vi.fn().mockResolvedValue([{ label: 'Miraflores, Lima', latitude: '-12.119', longitude: '-77.037' }]);
    const view = render(<AddressSearch enabled search={search} onSelect={onSelect} />);
    type(view.querySelector('input'), 'miraflores');
    click(view.querySelector('button'));
    await settle();
    expect(search).toHaveBeenCalledWith('miraflores');
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Miraflores, Lima') ?? null);
    expect(onSelect).toHaveBeenCalledWith('-12.119', '-77.037');
  });

  it('avisa si Mapbox falla y deja los campos manuales', async () => {
    const view = render(<AddressSearch enabled search={vi.fn().mockRejectedValue(new Error('x'))} onSelect={vi.fn()} />);
    type(view.querySelector('input'), 'miraflores');
    click(view.querySelector('button'));
    await settle();
    expect(view.textContent).toContain('Escribe latitud y longitud a mano');
  });
});
