import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSession, type Session } from '../../api/auth.js';
import { apiRequest, ApiError, errorMessage } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { LinkButton } from '../../components/ui/LinkButton.js';

type Result = { status: 'ready'; session: Session; needsOnboarding: boolean } | { status: 'anonymous' } | { status: 'error'; message: string };

export function RequireDonor({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ path: string; revision: number; value: Result }>();
  useEffect(() => {
    let active = true;
    void getSession().then(async session => {
      let needsOnboarding = false;
      if (session.actor.role === 'donante' && !session.mfaRequired) {
        try {
          await apiRequest('/api/v1/donors/me/profile');
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) needsOnboarding = true;
          else throw error;
        }
      }
      if (active) setResult({ path: location.pathname, revision, value: { status: 'ready', session, needsOnboarding } });
    }).catch((error: unknown) => {
      if (active) setResult({ path: location.pathname, revision, value: error instanceof ApiError && error.status === 401
        ? { status: 'anonymous' } : { status: 'error', message: errorMessage(error) } });
    });
    return () => { active = false; };
  }, [location.pathname, revision]);
  const state = result?.path === location.pathname && result.revision === revision ? result.value : null;
  if (!state) return <main className="p-6" role="status">Comprobando sesión…</main>;
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.status === 'error') return <main className="p-6" role="alert"><p>{state.message}</p><Button onClick={() => setRevision(n => n + 1)}>Reintentar</Button></main>;
  if (state.session.actor.role !== 'donante') return <main className="p-6" role="alert"><p>No tienes permisos para acceder al área del donante.</p><LinkButton to="/">Inicio</LinkButton></main>;
  if (state.session.mfaRequired) return <Navigate to="/verificar-identidad" replace />;
  if (state.needsOnboarding && location.pathname !== '/donante/perfil') {
    return <Navigate to="/donante/perfil" replace />;
  }
  return <>{children}</>;
}
