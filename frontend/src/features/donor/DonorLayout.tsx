import { AppLayout } from '../../components/layout/AppLayout.js';
import { DonorDemoProvider } from './DonorDemoContext.js';

// Área del donante: navegación de Penpot (Invitaciones, Mi perfil, Historial, Mis solicitudes). Todo viene del backend real.
export function DonorLayout() {
  return (
    <DonorDemoProvider>
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
    </DonorDemoProvider>
  );
}
