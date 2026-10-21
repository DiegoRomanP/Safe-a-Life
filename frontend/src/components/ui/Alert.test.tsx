// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { Alert } from './Alert.js';

setupRender();

describe('Alert', () => {
  it('muestra título y detalle', () => {
    const view = render(
      <Alert tone="success" title="Cambios guardados">
        La disponibilidad quedó actualizada.
      </Alert>,
    );
    expect(view.textContent).toContain('Cambios guardados');
    expect(view.textContent).toContain('La disponibilidad quedó actualizada.');
  });

  it('anuncia el tono con texto y oculta el ícono decorativo', () => {
    const view = render(<Alert tone="warning" title="Revisa el vencimiento" />);
    expect(view.querySelector('.sr-only')?.textContent).toBe('Aviso: ');
    expect(view.querySelector('[aria-hidden="true"]')?.textContent).toBe('!');
  });

  it('los errores usan role="alert"', () => {
    const view = render(<Alert tone="danger" title="No fue posible actualizar" />);
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.querySelector('.sr-only')?.textContent).toBe('Error: ');
  });

  it.each(['info', 'success', 'warning'] as const)('el tono %s no interrumpe con role="alert"', (tone) => {
    const view = render(<Alert tone={tone} title="Mensaje" />);
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });
});
