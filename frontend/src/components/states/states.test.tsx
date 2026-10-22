// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, render, setupRender } from '../../test/render.js';
import { Button } from '../ui/Button.js';
import { MemoryRouter } from 'react-router-dom';
import { ConflictNotice } from './ConflictNotice.js';
import { ErrorState } from './ErrorState.js';
import { ForbiddenState } from './ForbiddenState.js';
import { SaveErrorNotice } from './SaveErrorNotice.js';
import { EmptyState } from './EmptyState.js';
import { Loading } from './Loading.js';
import { SuccessNotice } from './SuccessNotice.js';

setupRender();

describe('Loading', () => {
  it('anuncia la carga con role="status"', () => {
    const view = render(<Loading message="Actualizando necesidades…" />);
    const status = view.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Cargando');
    expect(status?.textContent).toContain('Actualizando necesidades…');
  });
});

describe('EmptyState', () => {
  it('muestra mensaje, detalle y acción sin interrumpir', () => {
    const view = render(
      <EmptyState
        message="No hay invitaciones activas"
        detail="Cuando un hospital envíe una, aparecerá aquí."
        action={<Button variant="secondary">Volver</Button>}
      />,
    );
    expect(view.textContent).toContain('Sin resultados');
    expect(view.textContent).toContain('Cuando un hospital envíe una, aparecerá aquí.');
    expect(view.querySelector('button')?.textContent).toBe('Volver');
    expect(view.querySelector('[role]')).toBeNull();
  });
});

describe('SuccessNotice', () => {
  it('anuncia el resultado con role="status"', () => {
    const view = render(
      <SuccessNotice message="Cambios guardados" detail="La disponibilidad quedó actualizada." />,
    );
    expect(view.querySelector('[role="status"]')?.textContent).toContain('Cambios guardados');
  });
});

describe('ConflictNotice', () => {
  it('usa los textos de Penpot por defecto y role="alert"', () => {
    const view = render(<ConflictNotice onReview={() => {}} />);
    const alert = view.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('El estado cambió');
    expect(alert?.textContent).toContain('Revisa los datos antes de continuar.');
  });

  it('llama a onReview al pulsar «Revisar cambios»', () => {
    const onReview = vi.fn();
    click(render(<ConflictNotice onReview={onReview} />).querySelector('button'));
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});

describe('StatePanel', () => {
  it('oculta el ícono y la franja decorativa a lectores de pantalla', () => {
    const view = render(<EmptyState message="Sin datos" />);
    expect(view.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});

describe('ErrorState', () => {
  it('se anuncia con role="alert" y ofrece reintentar', () => {
    const onRetry = vi.fn();
    const view = render(<ErrorState onRetry={onRetry} />);
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar la información');
    click(view.querySelector('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ForbiddenState', () => {
  it('usa el mensaje neutro de SYS-01 y ofrece volver', () => {
    const view = render(
      <MemoryRouter>
        <ForbiddenState backTo="/donante/invitaciones" backLabel="Ir a mis invitaciones" />
      </MemoryRouter>,
    );
    expect(view.textContent).toContain('No pudimos abrir este recurso');
    expect(view.querySelector('a[href="/donante/invitaciones"]')?.textContent).toBe('Ir a mis invitaciones');
  });
});

describe('SaveErrorNotice', () => {
  it('no muestra nada sin error', () => {
    expect(render(<SaveErrorNotice error={null} onReview={() => {}} />).textContent).toBe('');
  });

  it.each([
    ['red', 'No pudimos conectar. No se registró ningún cambio'],
    ['sin_permiso', 'Tu cuenta no puede realizar esta acción. No se registró ningún cambio.'],
    ['conflicto', 'el tuyo no se guardó'],
  ] as const)('%s dice que nada cambió', (error, text) => {
    const view = render(<SaveErrorNotice error={error} onReview={() => {}} />);
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(text);
  });
});
