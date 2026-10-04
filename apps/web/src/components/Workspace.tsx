import { useEffect, useState, type ReactNode } from 'react';
import {
  Building2,
  ClipboardList,
  Gauge,
  History,
  Inbox,
  LogOut,
  Menu,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ActorRole, AuthSession } from '../api/client.js';
import {
  DonorHistoryPage,
  DonorInvitationsPage,
  DonorProfilePage,
  DonorRequestsPage,
} from '../pages/DonorPages.js';
import { HospitalBatchesPage, HospitalNeedsPage, HospitalOverviewPage, HospitalResponsesPage } from '../pages/HospitalPages.js';
import {
  SuperadminAuditPage,
  SuperadminConfigurationPage,
  SuperadminHospitalsPage,
  SuperadminTasksPage,
} from '../pages/SuperadminPages.js';
import { Brand, Notice, StatusBadge } from './Ui.js';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const navigation: Record<ActorRole, NavigationItem[]> = {
  donante: [
    { label: 'Invitaciones', path: '/app/donor/invitations', icon: Inbox },
    { label: 'Mi perfil', path: '/app/donor/profile', icon: UserRound },
    { label: 'Historial', path: '/app/donor/history', icon: History },
    { label: 'Mis solicitudes', path: '/app/donor/requests', icon: ClipboardList },
  ],
  admin_hospitalario: [
    { label: 'Resumen', path: '/app/hospital', icon: Gauge },
    { label: 'Necesidades', path: '/app/hospital/needs', icon: ClipboardList },
    { label: 'Respuestas', path: '/app/hospital/responses', icon: History },
    { label: 'Lotes', path: '/app/hospital/batches', icon: Send },
  ],
  superadmin: [
    { label: 'Tareas', path: '/app/superadmin/tasks', icon: Inbox },
    { label: 'Hospitales', path: '/app/superadmin/hospitals', icon: Building2 },
    { label: 'Auditoría', path: '/app/superadmin/audit', icon: ShieldCheck },
    { label: 'Configuración', path: '/app/superadmin/configuration', icon: Settings2 },
  ],
};

const defaultPath: Record<ActorRole, string> = {
  donante: '/app/donor/invitations',
  admin_hospitalario: '/app/hospital',
  superadmin: '/app/superadmin/tasks',
};

const roleLabel: Record<ActorRole, string> = {
  donante: 'Donante',
  admin_hospitalario: 'Hospital',
  superadmin: 'Superadmin',
};

export function Workspace({
  session,
  onLogout,
}: {
  session: AuthSession;
  onLogout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const actorName = session.actor.displayName;
  const areaName = session.actor.hospitalName ?? actorName;
  const navItems = navigation[session.actor.role];

  useEffect(() => {
    if (location.pathname === '/app') navigate(defaultPath[session.actor.role], { replace: true });
  }, [location.pathname, navigate, session.actor.role]);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('.workspace-content h1');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [location.pathname]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await onLogout();
      navigate('/', { replace: true });
    } catch {
      setLogoutError('No se confirmó el cierre de la sesión. Reintenta antes de dejar este dispositivo.');
    } finally {
      setLoggingOut(false);
    }
  }

  let page: ReactNode;
  if (location.pathname === '/app/donor/invitations' && session.actor.role === 'donante') {
    page = <DonorInvitationsPage />;
  } else if (location.pathname === '/app/donor/profile' && session.actor.role === 'donante') {
    page = <DonorProfilePage />;
  } else if (location.pathname === '/app/donor/history' && session.actor.role === 'donante') {
    page = <DonorHistoryPage />;
  } else if (location.pathname === '/app/donor/requests' && session.actor.role === 'donante') {
    page = <DonorRequestsPage />;
  } else if (location.pathname === '/app/hospital' && session.actor.role === 'admin_hospitalario') {
    page = <HospitalOverviewPage />;
  } else if (location.pathname === '/app/hospital/needs' && session.actor.role === 'admin_hospitalario') {
    page = <HospitalNeedsPage />;
  } else if (location.pathname === '/app/hospital/responses' && session.actor.role === 'admin_hospitalario') {
    page = <HospitalResponsesPage />;
  } else if (location.pathname === '/app/hospital/batches' && session.actor.role === 'admin_hospitalario') {
    page = <HospitalBatchesPage />;
  } else if (location.pathname === '/app/superadmin/tasks' && session.actor.role === 'superadmin') {
    page = <SuperadminTasksPage />;
  } else if (location.pathname === '/app/superadmin/hospitals' && session.actor.role === 'superadmin') {
    page = <SuperadminHospitalsPage />;
  } else if (location.pathname === '/app/superadmin/audit' && session.actor.role === 'superadmin') {
    page = <SuperadminAuditPage />;
  } else if (location.pathname === '/app/superadmin/configuration' && session.actor.role === 'superadmin') {
    page = <SuperadminConfigurationPage />;
  } else if (location.pathname === '/app') {
    page = <div className="loading-state">Abriendo el espacio de trabajo…</div>;
  } else {
    page = <Navigate to={defaultPath[session.actor.role]} replace />;
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <aside className="sidebar">
        <Brand inverse />
        <div className="sidebar-context">
          <span className="sidebar-context__label">{roleLabel[session.actor.role]}</span>
          <strong>{areaName}</strong>
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`} end key={path} to={path}>
              <Icon size={18} aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-demo-note">Datos sintéticos<br />y estado local</div>
          <button className="nav-link nav-link--logout" disabled={loggingOut} onClick={() => void logout()}>
            <LogOut size={17} aria-hidden="true" />{loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <span>Save a Life</span><span aria-hidden="true">/</span>
            <strong>{session.actor.role.replaceAll('_', ' ')}</strong>
          </div>
          <div className="workspace-user">
            <StatusBadge tone="warning">Modo demo</StatusBadge>
            <span className="workspace-user__name">{actorName}</span>
            <button aria-label="Cerrar sesión" className="icon-button mobile-logout" onClick={() => void logout()}>
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="mobile-navigation">
          <button
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation-list"
            className="mobile-navigation__toggle"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            {mobileNavOpen ? 'Cerrar navegación' : 'Navegación'}
          </button>
          <nav
            id="mobile-navigation-list"
            className="mobile-navigation__list"
            aria-label="Navegación principal"
            hidden={!mobileNavOpen}
          >
            {navItems.map(({ label, path, icon: Icon }) => (
              <NavLink
                className={({ isActive }) => `mobile-nav-link${isActive ? ' mobile-nav-link--active' : ''}`}
                end
                key={path}
                onClick={() => setMobileNavOpen(false)}
                to={path}
              >
                <Icon size={17} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
        </div>
        <section id="main-content" className="workspace-content" tabIndex={-1}>
          {logoutError && <Notice tone="error" title="No se cerró la sesión">{logoutError}</Notice>}
          {page}
        </section>
      </main>
    </div>
  );
}
