import { Navigate, type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout.js';
import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage.js';
import { ConfirmEmailChangePage } from '../features/auth/pages/ConfirmEmailChangePage.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { RecoverAccessPage } from '../features/auth/pages/RecoverAccessPage.js';
import { RegisterPage } from '../features/auth/pages/RegisterPage.js';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.js';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage.js';
import { VerifyIdentityPage } from '../features/auth/pages/VerifyIdentityPage.js';
import { DonorLayout } from '../features/donor/DonorLayout.js';
import { HistoryPage } from '../features/donor/pages/HistoryPage.js';
import { InvitationDetailPage } from '../features/donor/pages/InvitationDetailPage.js';
import { InvitationsPage } from '../features/donor/pages/InvitationsPage.js';
import { NewRequestPage } from '../features/donor/pages/NewRequestPage.js';
import { OnboardingPage } from '../features/donor/pages/OnboardingPage.js';
import { ProfilePage } from '../features/donor/pages/ProfilePage.js';
import { RequestsPage } from '../features/donor/pages/RequestsPage.js';
import { HospitalLayout } from '../features/hospital/HospitalLayout.js';
import { AssistedSignupsPage } from '../features/hospital/pages/AssistedSignupsPage.js';
import { BatchesPage } from '../features/hospital/pages/BatchesPage.js';
import { CreateNeedPage } from '../features/hospital/pages/CreateNeedPage.js';
import { NeedDetailPage } from '../features/hospital/pages/NeedDetailPage.js';
import { NeedsPage } from '../features/hospital/pages/NeedsPage.js';
import { ResponsesPage } from '../features/hospital/pages/ResponsesPage.js';
import { SummaryPage } from '../features/hospital/pages/SummaryPage.js';
import { SuperadminLayout } from '../features/superadmin/SuperadminLayout.js';
import { AdminsPage } from '../features/superadmin/pages/AdminsPage.js';
import { ConfigurationPage } from '../features/superadmin/pages/ConfigurationPage.js';
import { HospitalsPage } from '../features/superadmin/pages/HospitalsPage.js';
import { RequestDetailPage } from '../features/superadmin/pages/RequestDetailPage.js';
import { AdminRequestsPage } from '../features/superadmin/pages/RequestsPage.js';
import { SitesPage } from '../features/superadmin/pages/SitesPage.js';
import { TasksPage } from '../features/superadmin/pages/TasksPage.js';
import { InvitationLinkPage } from '../features/invitation/pages/InvitationLinkPage.js';
import { HomePage } from '../features/public/pages/HomePage.js';
import { NotFoundPage } from '../features/system/pages/NotFoundPage.js';

// Rutas de la app. Se exportan como datos para montarlas con un router de
// navegador en App.tsx y con uno en memoria en las pruebas.
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
  // Las vistas de acceso usan AuthShell (dos columnas), sin la cabecera pública.
  { path: 'ingresar', element: <LoginPage /> },
  { path: 'registro', element: <RegisterPage /> },
  { path: 'activar-cuenta', element: <ActivateAccountPage /> },
  { path: 'recuperar-acceso', element: <RecoverAccessPage /> },
  { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
  { path: 'verificar-identidad', element: <VerifyIdentityPage /> },
  { path: 'verificar-correo', element: <VerifyEmailPage /> },
  { path: 'cambiar-correo', element: <ConfirmEmailChangePage /> },
  // Enlace de invitación del correo (LINK-01), fuera del área autenticada.
  { path: 'invitaciones', element: <InvitationLinkPage /> },
  // Área del donante. Sin backend (D-4) todavía no hay guard de sesión.
  {
    path: 'donante',
    element: <DonorLayout />,
    children: [
      { index: true, element: <Navigate to="invitaciones" replace /> },
      { path: 'invitaciones', element: <InvitationsPage /> },
      { path: 'invitaciones/:invitationId', element: <InvitationDetailPage /> },
      { path: 'bienvenida', element: <OnboardingPage /> },
      { path: 'perfil', element: <ProfilePage /> },
      { path: 'historial', element: <HistoryPage /> },
      { path: 'solicitudes', element: <RequestsPage /> },
      { path: 'solicitudes/nueva', element: <NewRequestPage /> },
    ],
  },
  // Área del hospital. Sin backend (D-4) todavía no hay guard de sesión.
  {
    path: 'hospital',
    element: <HospitalLayout />,
    children: [
      { index: true, element: <SummaryPage /> },
      { path: 'necesidades', element: <NeedsPage /> },
      { path: 'necesidades/nueva', element: <CreateNeedPage /> },
      { path: 'necesidades/:needId', element: <NeedDetailPage /> },
      { path: 'necesidades/:needId/respuestas', element: <ResponsesPage /> },
      { path: 'necesidades/:needId/lotes', element: <BatchesPage /> },
      { path: 'altas', element: <AssistedSignupsPage /> },
    ],
  },
  // Área del superadmin. Sin backend (D-4) todavía no hay guard de sesión ni AAL2.
  {
    path: 'superadmin',
    element: <SuperadminLayout />,
    children: [
      { index: true, element: <TasksPage /> },
      { path: 'hospitales', element: <HospitalsPage /> },
      { path: 'sedes', element: <SitesPage /> },
      { path: 'administradores', element: <AdminsPage /> },
      { path: 'solicitudes', element: <AdminRequestsPage /> },
      { path: 'solicitudes/:requestId', element: <RequestDetailPage /> },
      { path: 'configuracion', element: <ConfigurationPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
