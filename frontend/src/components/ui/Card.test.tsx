// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { Button } from './Button.js';
import { Card } from './Card.js';
import { StatCard } from './StatCard.js';

setupRender();

describe('Card', () => {
  it('usa h2 por defecto para el título', () => {
    const view = render(<Card title="Información de la necesidad">Contenido</Card>);
    expect(view.querySelector('section h2')?.textContent).toBe('Información de la necesidad');
  });

  it('permite elegir el nivel del encabezado', () => {
    const view = render(
      <Card title="Lotes" headingLevel={3}>
        Contenido
      </Card>,
    );
    expect(view.querySelector('h3')?.textContent).toBe('Lotes');
    expect(view.querySelector('h2')).toBeNull();
  });

  it('muestra acciones junto al título', () => {
    const view = render(
      <Card title="Altas asistidas" actions={<Button>Iniciar alta</Button>}>
        Contenido
      </Card>,
    );
    expect(view.querySelector('header button')?.textContent).toBe('Iniciar alta');
  });

  it('sin título ni acciones no agrega encabezado', () => {
    const view = render(<Card>Solo contenido</Card>);
    expect(view.querySelector('header')).toBeNull();
    expect(view.textContent).toBe('Solo contenido');
  });
});

describe('StatCard', () => {
  it('muestra valor, etiqueta y nota en ese orden', () => {
    const view = render(<StatCard value={4} label="Necesidades activas" hint="Datos sintéticos" />);
    expect([...view.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      '4',
      'Necesidades activas',
      'Datos sintéticos',
    ]);
  });

  it('omite la nota si no se entrega', () => {
    expect(render(<StatCard value="2" label="Metas alcanzadas" />).querySelectorAll('p')).toHaveLength(2);
  });
});
