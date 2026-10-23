import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getSession, type Session } from '../../api/auth.js';
import { ApiError, errorMessage } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { LinkButton } from '../../components/ui/LinkButton.js';
import { StatePanel } from '../../components/states/StatePanel.js';

type GuardState = { status: 'loading' } | { status: 'ready'; session: Session } | { status: 'anonymous' } | { status: 'error'; message: string };
export function RequireSuperadmin({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ path: string; revision: number; value: GuardState }>();
  useEffect(() => {
    let active = true;
    void getSession().then((session) => {
      if (active) setResult({ path: location.pathname, revision, value: { status: 'ready', session } });
    }).catch((error: unknown) => {
      if (active) setResult({ path: location.pathname, revision, value: error instanceof ApiError && error.status === 401 ? { status: 'anonymous' } : { status: 'error', message: errorMessage(error) } });
    });
    return () => { active = false; };
  }, [location.pathname, revision]);
  const state: GuardState = result?.path === location.pathname && result.revision === revision ? result.value : { status: 'loading' };
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.status === 'ready') {
    if (state.session.actor.role !== 'superadmin') return <main className="mx-auto max-w-2xl p-6"><h1 className="mb-5 text-3xl font-bold">Acceso restringido</h1><StatePanel tone="warning" symbol="!" role="alert" title="Permiso insuficiente" message="Tu cuenta no tiene acceso a la administración central." action={<LinkButton to="/">Volver al inicio</LinkButton>} /></main>;
    if (state.session.aal !== 2 || state.session.mfaRequired) return <Navigate to="/verificar-identidad" replace state={{ returnTo: location.pathname }} />;
    return children ?? <Outlet />;
  }
  return <main className="mx-auto max-w-2xl p-6"><h1 className="mb-5 text-3xl font-bold">Administración central</h1>{state.status === 'loading' ? <p role="status" aria-busy="true">Comprobando sesión…</p> : <StatePanel tone="warning" symbol="!" role="alert" title="No pudimos comprobar la sesión" message={state.message} action={<Button onClick={() => setRevision((n) => n + 1)}>Reintentar</Button>} />}</main>;
}
