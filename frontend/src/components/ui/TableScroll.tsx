import type { ReactNode } from 'react';

// Contenedor común de las tablas anchas: en móvil se desplazan dentro de la tarjeta. La región es enfocable para que el
// teclado pueda desplazarla (axe: scrollable-region-focusable) y se nombra con la etiqueta de la tabla.
// `relative` contiene los `sr-only` (position:absolute) de las filas; sin él desbordaban la página en móvil.
// `scroll-shadow-x` (styles.css) sombrea el borde por donde queda contenido oculto.
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      {/* shortcut: el aviso supone que toda tabla tiene min-w ≥ 640 px (hoy es así); si una tabla estrecha usa
          TableScroll, mostrarlo solo cuando scrollWidth > clientWidth. */}
      <p aria-hidden="true" className="text-sm text-muted sm:hidden">
        Desliza la tabla hacia los lados para ver todas las columnas.
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable: el teclado debe poder enfocarla */}
      <div role="region" aria-label={label} tabIndex={0} className="relative scroll-shadow-x overflow-x-auto rounded-xl border border-line">
        {children}
      </div>
    </>
  );
}
