import { DevScenarioPicker } from '../../components/dev/DevScenarioPicker.js';
import { AppLayout } from '../../components/layout/AppLayout.js';
import { QueryCacheProvider } from '../../lib/queryCache.js';
import { DonorDemoProvider, useDonorDemo } from './DonorDemoContext.js';

// Área del donante: navegación de Penpot (Invitaciones, Mi perfil, Historial,
// Mis solicitudes) sobre el estado de demostración en memoria (D-4). Las
// lecturas ya vistas se recuerdan mientras se sigue en el área.
export function DonorLayout() {
  return (
    <DonorDemoProvider>
      <QueryCacheProvider>
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
      </QueryCacheProvider>
    </DonorDemoProvider>
  );
}

function DonorScenarioPicker() {
  const { scenario, setScenario } = useDonorDemo();
  return <DevScenarioPicker value={scenario} onChange={setScenario} />;
}
