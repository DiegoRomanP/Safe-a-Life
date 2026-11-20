import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loading } from '../../../components/states/Loading.js';
import type { ActorRole, LoginSession } from '../../../lib/api/auth.js';
import { getAuthOperationState, getAuthSession, restoreSession, subscribeAuthOperation } from './session.js';

type Access = 'cargando' | 'permitido' | 'mfa' | 'denegado';

// Hospital y superadmin exigen aal 2 (ADR-004 §5): con aal 1 se les manda a completar MFA, no a /ingresar.
const accessFor = (role: ActorRole, session: Pick<LoginSession, 'role' | 'aal'> | null | undefined): Access => {
  if (session?.role !== role) return 'denegado';
  return role !== 'donante' && session.aal !== 2 ? 'mfa' : 'permitido';
};

// Guard de área: sin sesión verificada del rol, o si el backend no la confirma, vuelve a /ingresar sin mostrar el área.
export function RequireRole({ allow, children }: { allow: ActorRole; children: ReactNode }) {
  const [access, setAccess] = useState<Access>(() => {
    const session = getAuthSession();
    return session ? accessFor(allow, session) : 'cargando';
  });
  // Una sesión que expira a mitad de uso (401) saca del área sin mostrar más datos.
  const expired = useSyncExternalStore(subscribeAuthOperation, getAuthOperationState, getAuthOperationState) === 'expired';

  useEffect(() => {
    if (access !== 'cargando') return;
    let live = true;
    restoreSession().then(
      (session) => { if (live) setAccess(accessFor(allow, session)); },
      () => { if (live) setAccess('denegado'); },
    );
    return () => { live = false; };
  }, [access, allow]);

  if (expired) return <Navigate to="/ingresar" replace />;
  if (access === 'cargando') {
    return (
      <main id="contenido" tabIndex={-1} className="px-4 py-10 focus:outline-none">
        <Loading message="Comprobando tu sesión." />
      </main>
    );
  }
  if (access === 'mfa') return <Navigate to="/verificar-identidad" replace />;
  if (access === 'denegado') return <Navigate to="/ingresar" replace />;
  return children;
}
