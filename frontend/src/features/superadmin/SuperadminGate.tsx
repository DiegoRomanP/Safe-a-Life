import { Outlet } from 'react-router-dom';
import { ErrorState } from '../../components/states/ErrorState.js';
import { Loading } from '../../components/states/Loading.js';
import { useSuperadmin } from './SuperadminContext.js';

// Muestra las páginas solo con los datos cargados del backend; mientras tanto, carga o error con reintento.
export function SuperadminGate() {
  const { status, reload } = useSuperadmin();
  if (status === 'loading') return <Loading message="Cargando la administración central." />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  return <Outlet />;
}
