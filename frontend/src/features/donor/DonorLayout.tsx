import { DevScenarioPicker } from '../../components/dev/DevScenarioPicker.js';
import { AppLayout } from '../../components/layout/AppLayout.js';
import { DonorDemoProvider, useDonorDemo } from './DonorDemoContext.js';

// Área del donante: navegación de Penpot (Invitaciones, Mi perfil, Historial,
// Mis solicitudes) sobre el estado de demostración en memoria (D-4).
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
        devTools={import.meta.env.DEV && <DonorScenarioPicker />}
      />
    </DonorDemoProvider>
  );
}

function DonorScenarioPicker() {
  const { scenario, setScenario } = useDonorDemo();
  return <DevScenarioPicker value={scenario} onChange={setScenario} />;
}
