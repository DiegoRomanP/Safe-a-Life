import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../../components/layout/Brand.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { logout } from '../../api/auth.js';
import { createMutationIntent, errorMessage } from '../../api/client.js';
import './superadmin.css';

const navigation = [['tareas', 'Tareas'], ['hospitales', 'Hospitales'], ['sedes', 'Sedes'], ['administradores', 'Administradores'], ['solicitudes', 'Solicitudes'], ['configuracion', 'Configuración'], ['auditoria', 'Auditoría']];
export function SuperadminLayout() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const intent = useRef(createMutationIntent());
  const location = useLocation();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const title = navigation.find(([path]) => location.pathname.includes('/' + path))?.[1] ?? 'Superadmin';
    document.title = title + ' | Save a Life';
    main.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [location.pathname]);
  const signOut = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await logout(intent.current.keyFor('/api/v1/auth/sessions/current', null)); navigate('/ingresar', { replace: true }); }
    catch (error) { setError(errorMessage(error)); }
    finally { busy.current = false; setPending(false); }
  };
  return <div className="sa-shell">
    <a href="#contenido-superadmin" className="sa-skip">Saltar al contenido</a>
    <header className="sa-header"><div className="flex flex-wrap items-center gap-5"><Brand /><Badge tone="brand">Prototipo académico · Datos sintéticos</Badge></div><div className="flex items-center gap-4"><div><p className="font-semibold">Administración central</p><p className="text-sm text-muted">Superadmin</p></div><span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-petrol font-bold text-white">SA</span></div></header>
    <div className="sa-body"><aside className="sa-rail"><button type="button" aria-expanded={open} aria-controls="superadmin-navigation" className="sa-menu" onClick={() => setOpen(!open)}>{open ? 'Cerrar navegación' : 'Abrir navegación'}</button><p className="sa-rail-title">Administración</p><nav id="superadmin-navigation" aria-label="Administración central" className={open ? 'sa-nav is-open' : 'sa-nav'}><ul>{navigation.map(([path, label]) => <li key={path}><NavLink to={'/superadmin/' + path} onClick={() => setOpen(false)}>{label}</NavLink></li>)}</ul></nav><div className="sa-local"><strong>Datos sintéticos</strong><p>Conexión al servidor.</p><Button variant="ghost" className="text-white focus-visible:outline-white" disabled={pending} onClick={() => { void signOut(); }}>{pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</Button>{error && <p role="alert">{error}</p>}</div></aside>
    <main ref={main} id="contenido-superadmin" tabIndex={-1} className="sa-main"><div className="sa-content"><Outlet /></div></main></div>
  </div>;
}

