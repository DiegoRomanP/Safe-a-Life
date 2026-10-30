import { useLocation } from 'react-router-dom';
import { DevScenarioPicker } from '../../components/dev/DevScenarioPicker.js';
import { AppLayout } from '../../components/layout/AppLayout.js';
import { Alert } from '../../components/ui/Alert.js';
import { DonorDemoProvider, useDonorDemo } from './DonorDemoContext.js';

// Área del donante: navegación de Penpot (Invitaciones, Mi perfil, Historial,
// Mis solicitudes). Perfil y bienvenida usan el backend real; el resto es demo
// en memoria y lo dice en pantalla.
const REAL_PATHS = ['/donante/perfil', '/donante/bienvenida'];

export function DonorLayout() {
  const isDemoView = !REAL_PATHS.includes(useLocation().pathname.replace(/\/$/, ''));
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
        notice={isDemoView && (
          <Alert tone="warning" title="Datos de ejemplo">
            Esta sección todavía no está conectada al servidor: lo que ves y cambies aquí no se guarda.
          </Alert>
        )}
        devTools={import.meta.env.DEV && isDemoView && <DonorScenarioPicker />}
      />
    </DonorDemoProvider>
  );
}

function DonorScenarioPicker() {
  const { scenario, setScenario } = useDonorDemo();
  return <DevScenarioPicker value={scenario} onChange={setScenario} />;
}
