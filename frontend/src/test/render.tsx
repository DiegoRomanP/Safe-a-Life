import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

// Monta componentes con react-dom y act, igual que App.test.tsx, sin
// dependencias de testing nuevas. Cada prueba recibe un contenedor limpio.
let root: Root | undefined;
let container: HTMLDivElement | undefined;

export function setupRender() {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });
}

export function render(ui: ReactNode): HTMLDivElement {
  if (!root || !container) throw new Error('Llama a setupRender() en el archivo de prueba.');
  act(() => root!.render(ui));
  return container;
}

export function click(element: Element | null) {
  if (!element) throw new Error('No se encontró el elemento a pulsar.');
  act(() => {
    (element as HTMLElement).click();
  });
}
