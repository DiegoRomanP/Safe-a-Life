import { Outlet } from 'react-router-dom';
import { Badge } from '../ui/Badge.js';
import { Brand } from './Brand.js';
import { useSignOut } from './useSignOut.js';

// Pantalla única de enfoque (p. ej. el donante que aún debe completar su perfil): solo marca, etiqueta académica y
// «Cerrar sesión», sin navegación a otras secciones.
export function FocusLayout() {
  const { closing, signOut } = useSignOut();
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-7">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Brand />
          <Badge tone="brand">Prototipo académico</Badge>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-disabled={closing}
          className="inline-flex min-h-11 items-center rounded px-2 text-sm font-semibold text-petrol underline-offset-4 hover:underline aria-disabled:opacity-70"
        >
          {closing ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </header>
      <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-10 focus:outline-none sm:px-12">
        <div className="mx-auto flex max-w-[760px] flex-col gap-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
