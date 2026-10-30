import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loading } from '../../../components/states/Loading.js';
import type { ActorRole } from '../../../lib/api/auth.js';
import { getAuthSession, restoreSession } from './session.js';

type Access = 'cargando' | 'permitido' | 'denegado';

const accessFor = (role: ActorRole, sessionRole: ActorRole | undefined): Access => (sessionRole === role ? 'permitido' : 'denegado');

// Guard de área: sin sesión verificada del rol, o si el backend no la confirma, vuelve a /ingresar sin mostrar el área.
// shortcut: solo compara el rol (basta para el donante, sin MFA); hospital y superadmin necesitarán exigir aal 2.
export function RequireRole({ allow, children }: { allow: ActorRole; children: ReactNode }) {
  const [access, setAccess] = useState<Access>(() => {
    const session = getAuthSession();
    return session ? accessFor(allow, session.role) : 'cargando';
  });

  useEffect(() => {
    if (access !== 'cargando') return;
    let live = true;
    restoreSession().then(
      (session) => { if (live) setAccess(accessFor(allow, session?.role)); },
      () => { if (live) setAccess('denegado'); },
    );
    return () => { live = false; };
  }, [access, allow]);

  if (access === 'cargando') {
    return (
      <main id="contenido" tabIndex={-1} className="px-4 py-10 focus:outline-none">
        <Loading message="Comprobando tu sesión." />
      </main>
    );
  }
  if (access === 'denegado') return <Navigate to="/ingresar" replace />;
  return children;
}
