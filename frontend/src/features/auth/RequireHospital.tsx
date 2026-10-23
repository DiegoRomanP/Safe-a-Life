import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getSession, type Session } from '../../api/auth.js';
import { ApiError, errorMessage } from '../../api/client.js';

export function RequireHospital({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ session?: Session; error?: string; anonymous?: boolean }>();
  useEffect(() => {
    let active = true;
    void getSession().then(session => {
      if (active) setResult({ session });
    }).catch((error: unknown) => {
      if (active) setResult(error instanceof ApiError && error.status === 401
        ? { anonymous: true } : { error: errorMessage(error) });
    });
    return () => { active = false; };
  }, []);
  if (!result) return <main className="p-8" role="status">Comprobando acceso hospitalario…</main>;
  if (result.anonymous) return <Navigate to="/ingresar" replace />;
  if (result.error) return <main className="p-8" role="alert">{result.error}</main>;
  if (result.session?.actor.role !== 'admin_hospitalario')
    return <main className="p-8" role="alert">Tu cuenta no tiene acceso al área Hospital.</main>;
  if (result.session.aal !== 2 || result.session.mfaRequired)
    return <Navigate to="/verificar-identidad" replace />;
  return <>{children}</>;
}
