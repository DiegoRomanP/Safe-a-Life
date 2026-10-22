import { AppLayout } from '../../components/layout/AppLayout.js';
import { SuperadminDemoProvider } from './SuperadminDemoContext.js';

// Área del superadmin: navegación de Penpot sobre el estado de demostración en
// memoria (D-4). El superadmin no navega el padrón de donantes.
export function SuperadminLayout() {
  return (
    <SuperadminDemoProvider>
      <AppLayout
        navLabel="Administración central"
        navItems={[
          { to: '/superadmin', label: 'Tareas', end: true },
          { to: '/superadmin/hospitales', label: 'Hospitales' },
          { to: '/superadmin/sedes', label: 'Sedes' },
          { to: '/superadmin/administradores', label: 'Administradores' },
          { to: '/superadmin/solicitudes', label: 'Solicitudes' },
          { to: '/superadmin/configuracion', label: 'Configuración' },
          { to: '/superadmin/auditoria', label: 'Auditoría' },
        ]}
        accountTitle="Administración central"
        accountRole="Superadmin"
        initials="SA"
      />
    </SuperadminDemoProvider>
  );
}
