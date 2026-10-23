import { RequireSuperadmin } from '../features/auth/RequireSuperadmin.js';
import { RequireDonor } from '../features/auth/RequireDonor.js';
import { SuperadminLayout } from '../features/superadmin/SuperadminLayout.js';
import { RequestsPage as SuperadminRequestsPage } from '../features/superadmin/pages/RequestsPage.js';
import { RequestDetailPage } from '../features/superadmin/pages/RequestDetailPage.js';
import { ConfigurationPage } from '../features/superadmin/pages/ConfigurationPage.js';
import { AuditPage } from '../features/superadmin/pages/AuditPage.js';
import { TasksPage } from '../features/superadmin/pages/TasksPage.js';
import { HospitalsPage } from '../features/superadmin/pages/HospitalsPage.js';
import { SitesPage } from '../features/superadmin/pages/SitesPage.js';
import { AdministratorsPage } from '../features/superadmin/pages/AdministratorsPage.js';
import { Navigate, type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout.js';
import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage.js';
import { ClaimHospitalAdminPage } from '../features/auth/pages/ClaimHospitalAdminPage.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { RecoverAccessPage } from '../features/auth/pages/RecoverAccessPage.js';
import { RegisterPage } from '../features/auth/pages/RegisterPage.js';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.js';
import { VerifyIdentityPage } from '../features/auth/pages/VerifyIdentityPage.js';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage.js';
import { DonorLayout } from '../features/donor/DonorLayout.js';
import { HistoryPage } from '../features/donor/pages/HistoryPage.js';
import { InvitationDetailPage } from '../features/donor/pages/InvitationDetailPage.js';
import { InvitationsPage } from '../features/donor/pages/InvitationsPage.js';
import { ProfilePage } from '../features/donor/pages/ProfilePage.js';
import { RequestsPage } from '../features/donor/pages/RequestsPage.js';
import { HomePage } from '../features/public/pages/HomePage.js';
import { NotFoundPage } from '../features/system/pages/NotFoundPage.js';

// Rutas de la app. Se exportan como datos para montarlas con un router de
// navegador en App.tsx y con uno en memoria en las pruebas.
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
  { path: 'ingresar', element: <LoginPage /> },
  { path: 'registro', element: <RegisterPage /> },
  { path: 'verificar-correo', element: <VerifyEmailPage /> },
  { path: 'activar-cuenta', element: <ActivateAccountPage /> },
  { path: 'invitacion-administrador', element: <ClaimHospitalAdminPage /> },
  { path: 'recuperar-acceso', element: <RecoverAccessPage /> },
  { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
  { path: 'verificar-identidad', element: <VerifyIdentityPage /> },
  // Área del donante. Requiere sesión real con rol donante.
  {
    path: 'donante',
    element: <RequireDonor><DonorLayout /></RequireDonor>,
    children: [
      { index: true, element: <Navigate to="perfil" replace /> },
      { path: 'invitaciones', element: <InvitationsPage /> },
      { path: 'invitaciones/:invitationId', element: <InvitationDetailPage /> },
      { path: 'perfil', element: <ProfilePage /> },
      { path: 'historial', element: <HistoryPage /> },
      { path: 'solicitudes', element: <RequestsPage /> },
    ],
  },
  {
    path: 'superadmin',
    element: <RequireSuperadmin><SuperadminLayout /></RequireSuperadmin>,
    children: [
      { index: true, element: <Navigate to="tareas" replace /> },
      { path: 'tareas', element: <TasksPage /> },
      { path: 'hospitales', element: <HospitalsPage /> },
      { path: 'sedes', element: <SitesPage /> },
      { path: 'administradores', element: <AdministratorsPage /> },
      { path: 'solicitudes', element: <SuperadminRequestsPage /> },
      { path: 'solicitudes/:requestId', element: <RequestDetailPage /> },
      { path: 'configuracion', element: <ConfigurationPage /> },
      { path: 'auditoria', element: <AuditPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
