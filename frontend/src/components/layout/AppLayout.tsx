import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
};

// Shell autenticado de Penpot («+»): cabecera con marca, etiqueta académica y
// cuenta; rail petróleo con «Saltar al contenido», navegación por rol y
// «Cerrar sesión». La ruta activa lleva aria-current (NavLink) y un borde
// blanco a la izquierda. Sin backend (D-4), cerrar sesión vuelve al inicio.
export function AppLayout({ navLabel, navItems, accountTitle, accountRole, initials }: AppLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#contenido"
        className="sr-only z-10 rounded-lg bg-surface px-4 py-2 font-semibold text-petrol focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3 sm:px-7">
        <div className="flex flex-wrap items-center gap-6">
          <Brand />
          <Badge tone="brand">Prototipo académico</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
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
        <aside className="flex flex-col bg-petrol py-4 text-white lg:w-60 lg:shrink-0 lg:py-8">
          <nav aria-label={navLabel}>
            <ul className="flex flex-wrap lg:flex-col">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        'block border-l-4 px-5 py-3 focus-visible:outline-white focus-visible:-outline-offset-4',
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
          <div className="mt-4 flex flex-col items-start gap-1 px-6 lg:mt-auto">
            <p className="text-sm text-white/85">Sesión protegida</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-white"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-10 focus:outline-none sm:px-12">
          <div className="mx-auto flex max-w-[1088px] flex-col gap-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
