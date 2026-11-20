import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../../features/auth/session/session.js';
import { Badge } from '../ui/Badge.js';
import { cx } from '../ui/cx.js';
import { Brand } from './Brand.js';

// end: la ruta solo está activa cuando coincide exacta (p. ej. «Resumen» en
// /hospital no debe marcarse en /hospital/necesidades).
export type AppNavItem = { to: string; label: string; end?: boolean };

export type AppLayoutProps = {
  navLabel: string;
  navItems: AppNavItem[];
  accountTitle: string;
  accountRole: string;
  initials: string;
  /** Herramientas de desarrollo sobre el contenido (solo en DEV). */
  devTools?: ReactNode;
  /** Aviso sobre el contenido, visible en todos los entornos. */
  notice?: ReactNode;
};

// Shell autenticado de Penpot («+»): cabecera con marca, etiqueta académica y
// cuenta; rail petróleo con «Saltar al contenido», navegación por rol y
// «Cerrar sesión». La ruta activa lleva aria-current (NavLink) y un borde
// blanco a la izquierda. Cerrar sesión borra la sesión del servidor y de memoria y vuelve a /ingresar.
export function AppLayout({ navLabel, navItems, accountTitle, accountRole, initials, devTools, notice }: AppLayoutProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [closing, setClosing] = useState(false);
  // En móvil la fila de pestañas se desplaza: centra la activa para que nunca quede cortada. Se ajusta scrollLeft del
  // <nav> (no scrollIntoView) para no mover la página; en lg no hay desbordamiento y no tiene efecto.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);
  const signOut = () => {
    if (closing) return;
    setClosing(true);
    void logout().then(
      () => navigate('/ingresar', { replace: true }),
      () => navigate('/ingresar', { replace: true, state: { logoutFailed: true } }),
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#contenido"
        className="sr-only z-10 rounded-lg bg-surface px-4 py-2 font-semibold text-petrol focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      {/* En móvil: marca y avatar en una fila y la etiqueta académica debajo; el nombre de la cuenta solo desde sm. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-7">
        <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-6">
          <Brand />
          <Badge tone="brand" className="order-last sm:order-none">Prototipo académico</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="sr-only text-right sm:not-sr-only">
            <p className="font-semibold text-ink">{accountTitle}</p>
            <p className="text-sm text-muted">{accountRole}</p>
          </div>
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-petrol text-sm font-bold text-white"
          >
            {initials}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Móvil: una fila de pestañas desplazable con indicador inferior y «Cerrar sesión» al lado; lg: rail vertical. */}
        <aside className="flex items-stretch bg-petrol text-white lg:w-60 lg:shrink-0 lg:flex-col lg:py-8">
          {/* scroll-shadow-x: un brillo en el borde indica que hay más secciones hacia ese lado. */}
          <nav
            ref={navRef}
            aria-label={navLabel}
            className="relative min-w-0 flex-1 scroll-shadow-x overflow-x-auto [--scroll-bg:var(--color-petrol)] [--scroll-shade:rgb(255_255_255/0.5)] [scrollbar-color:rgb(255_255_255/0.35)_transparent] [scrollbar-width:thin] lg:flex-none lg:overflow-visible"
          >
            <ul className="flex lg:flex-col">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        'block border-b-4 px-4 py-3 whitespace-nowrap transition-[color,background-color,border-color] duration-150 focus-visible:outline-white focus-visible:-outline-offset-4 lg:border-b-0 lg:border-l-4 lg:px-5',
                        isActive ? 'border-white font-bold' : 'border-transparent text-white/85 hover:bg-white/10',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex shrink-0 flex-col items-start justify-center gap-1 border-l border-white/20 px-2 lg:mt-auto lg:border-l-0 lg:px-4">
            <p className="hidden text-sm text-white/85 lg:block">Sesión protegida</p>
            <button
              type="button"
              onClick={signOut}
              aria-disabled={closing}
              className="inline-flex min-h-11 items-center rounded px-2 text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-white aria-disabled:opacity-70"
            >
              {closing ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </aside>

        <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-10 focus:outline-none sm:px-12">
          <div className="mx-auto flex max-w-[1088px] flex-col gap-8">
            {notice}
            {devTools}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
