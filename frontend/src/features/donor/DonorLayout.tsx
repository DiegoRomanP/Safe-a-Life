import { Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout.js';
import { FocusLayout } from '../../components/layout/FocusLayout.js';
import { ErrorState } from '../../components/states/ErrorState.js';
import { ForbiddenState } from '../../components/states/ForbiddenState.js';
import { Loading } from '../../components/states/Loading.js';
import { useDemoQuery } from '../../lib/useDemoQuery.js';
import { DonorDemoProvider, useDonorDemo } from './DonorDemoContext.js';

const ONBOARDING = '/donante/bienvenida';

// Área del donante: navegación de Penpot (Invitaciones, Mi perfil, Historial, Mis solicitudes). Todo viene del backend real.
export function DonorLayout() {
  return (
    <DonorDemoProvider>
      <DonorShell />
    </DonorDemoProvider>
  );
}

// RF-IAM-01: la cuenta solo se activa con el perfil completo. Sin perfil, el donante ve una única pantalla de enfoque
// (el onboarding) y cualquier otra ruta lo devuelve allí; con perfil, la app completa. Si no se puede saber si hay
// perfil, el área no se abre (falla cerrado). El servidor sigue siendo quien excluye del matching a una cuenta incompleta.
function DonorShell() {
  const { scenario, getProfile } = useDonorDemo();
  const query = useDemoQuery(getProfile, scenario);
  const { pathname } = useLocation();

  if (query.status === 'loading') return <Loading message="Cargando tu cuenta…" />;
  if (query.status === 'error') {
    return query.kind === 'sin_permiso' ? <ForbiddenState backTo="/ingresar" backLabel="Volver a ingresar" /> : <ErrorState onRetry={query.retry} />;
  }
  if (query.data === null) {
    // Recién guardado el perfil, el dato viejo (null) sigue visible hasta que llega el nuevo: no se rebota a la bienvenida.
    if (query.refreshing) return <Loading message="Guardando tu perfil…" />;
    return pathname === ONBOARDING ? <FocusLayout /> : <Navigate to={ONBOARDING} replace />;
  }
  // Con perfil completo, la pantalla de enfoque ya no aplica: se pasa a Invitaciones (también justo tras guardarlo).
  if (pathname === ONBOARDING) return <Navigate to="/donante/invitaciones" replace state={{ onboarded: true }} />;
  return (
    <AppLayout
      navLabel="Cuenta del donante"
      navItems={[
        { to: '/donante/invitaciones', label: 'Invitaciones' },
        { to: '/donante/perfil', label: 'Mi perfil' },
        { to: '/donante/historial', label: 'Historial' },
        { to: '/donante/solicitudes', label: 'Mis solicitudes' },
      ]}
      accountTitle="Cuenta personal"
      accountRole="Donante"
      initials="DP"
    />
  );
}
