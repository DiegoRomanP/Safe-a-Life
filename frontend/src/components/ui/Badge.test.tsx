// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { Badge } from './Badge.js';

setupRender();

describe('Badge', () => {
  it.each([
    ['info', 'Activa', 'bg-soft-blue'],
    ['success', 'Meta alcanzada', 'bg-success-soft'],
    ['warning', 'Pendiente', 'bg-warning-soft'],
    ['danger', 'Cancelada', 'bg-danger-soft'],
    ['neutral', 'Borrador', 'bg-neutral-soft'],
    ['brand', 'Prototipo académico', 'bg-brand-soft'],
  ] as const)('tono %s muestra el texto «%s»', (tone, label, expected) => {
    const badge = render(<Badge tone={tone}>{label}</Badge>).querySelector('span');
    expect(badge?.textContent).toBe(label);
    expect(badge?.className).toContain(expected);
  });

  it('usa el tono neutral por defecto', () => {
    expect(render(<Badge>Borrador</Badge>).querySelector('span')?.className).toContain('bg-neutral-soft');
  });
});
