import { AppLayout } from '../../components/layout/AppLayout.js';
import { HospitalDemoProvider } from './HospitalDemoContext.js';

// Área del hospital: navegación de Penpot sobre el estado de demostración en
// memoria (D-4). «Altas asistidas» llega con el slice secundario (HOS-06).
export function HospitalLayout() {
  return (
    <HospitalDemoProvider>
      <AppLayout
        navLabel="Cuenta del hospital"
        navItems={[
          { to: '/hospital', label: 'Resumen', end: true },
          { to: '/hospital/necesidades', label: 'Necesidades' },
        ]}
        accountTitle="Hospital Nacional Central"
        accountRole="Hospital"
        initials="HA"
      />
    </HospitalDemoProvider>
  );
}
