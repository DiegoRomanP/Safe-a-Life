import { AppLayout } from '../../components/layout/AppLayout.js';
import { SuperadminProvider } from './SuperadminContext.js';

// Área del superadmin: navegación de Penpot sobre los datos del backend real. El superadmin no navega el padrón de donantes.
export function SuperadminLayout() {
  return (
    <SuperadminProvider>
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
    </SuperadminProvider>
  );
}
