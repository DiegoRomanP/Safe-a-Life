import type { ReactNode } from 'react';

// Contenedor común de las tablas anchas: en móvil se desplazan dentro de la tarjeta. La región es enfocable para que el
// teclado pueda desplazarla (axe: scrollable-region-focusable) y se nombra con la etiqueta de la tabla.
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable: el teclado debe poder enfocarla
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-xl border border-line bg-surface">
      {children}
    </div>
  );
}
