import { useEffect } from 'react';
import { Outlet, useMatches } from 'react-router-dom';

/** Datos de `handle` de cada ruta: título de la vista y área que la contiene. */
export type RouteHandle = { title?: string; area?: string };

export const APP_NAME = 'Save a Life';

// Pone el <title> de la pestaña según la ruta activa: «Vista · Área · Save a
// Life». Los títulos son fijos por ruta y nunca llevan IDs, tokens ni datos de
// la persona, porque el título queda en el historial y en las pestañas.
export function DocumentTitle() {
  const matches = useMatches();
  // De la ruta más profunda a la raíz: gana el título más específico.
  const handles = matches.map((match) => (match.handle ?? {}) as RouteHandle).reverse();
  const title = handles.find((handle) => handle.title)?.title;
  const area = handles.find((handle) => handle.area)?.area;
  const text = [title, area, APP_NAME].filter(Boolean).join(' · ');

  useEffect(() => {
    document.title = text;
  }, [text]);

  return <Outlet />;
}
