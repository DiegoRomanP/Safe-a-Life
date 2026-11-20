import { AppLayout } from '../../components/layout/AppLayout.js';
import { HospitalProvider } from './HospitalContext.js';

// Área del hospital: navegación de Penpot sobre los datos del backend real.
export function HospitalLayout() {
  return (
    <HospitalProvider>
      <AppLayout
        navLabel="Cuenta del hospital"
        navItems={[
          { to: '/hospital', label: 'Resumen', end: true },
          { to: '/hospital/necesidades', label: 'Necesidades' },
          { to: '/hospital/altas', label: 'Altas asistidas' },
        ]}
        accountTitle="Cuenta del hospital"
        accountRole="Hospital"
        initials="HA"
      />
    </HospitalProvider>
  );
}
