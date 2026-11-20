import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorState } from '../../components/states/ErrorState.js';
import { ForbiddenState } from '../../components/states/ForbiddenState.js';
import { Loading } from '../../components/states/Loading.js';
import { useHospital } from './HospitalContext.js';

// Muestra las páginas solo con los datos cargados del backend; mientras tanto, carga, error con reintento o «sin acceso».
export function HospitalGate() {
  const { status, reload, routeChanged } = useHospital();
  const { pathname } = useLocation();
  // Un error de una pantalla no reaparece en otra.
  useEffect(() => { routeChanged(); }, [pathname, routeChanged]);
  if (status === 'loading') return <Loading message="Cargando tu hospital." />;
  if (status === 'error') return <ErrorState onRetry={reload} />;
  if (status === 'forbidden') return <ForbiddenState backTo="/ingresar" backLabel="Volver a ingresar" />;
  return <Outlet />;
}
