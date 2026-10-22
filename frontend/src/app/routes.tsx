import { Navigate, type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout.js';
import { AdminInvitationPage } from '../features/auth/pages/AdminInvitationPage.js';
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
import { AuditPage } from '../features/superadmin/pages/AuditPage.js';
import { ConfigurationPage } from '../features/superadmin/pages/ConfigurationPage.js';
import { HospitalsPage } from '../features/superadmin/pages/HospitalsPage.js';
import { RequestDetailPage } from '../features/superadmin/pages/RequestDetailPage.js';
import { AdminRequestsPage } from '../features/superadmin/pages/RequestsPage.js';
import { SitesPage } from '../features/superadmin/pages/SitesPage.js';
import { TasksPage } from '../features/superadmin/pages/TasksPage.js';
import { InvitationLinkPage } from '../features/invitation/pages/InvitationLinkPage.js';
import { HomePage } from '../features/public/pages/HomePage.js';
import { NotFoundPage } from '../features/system/pages/NotFoundPage.js';
import { DocumentTitle } from './DocumentTitle.js';

// Rutas de la app. Se exportan como datos para montarlas con un router de
// navegador en App.tsx y con uno en memoria en las pruebas.
// Todas cuelgan de DocumentTitle, que pone el <title> de la pestaña a partir del
// `handle` de cada ruta.
export const routes: RouteObject[] = [
  {
    element: <DocumentTitle />,
    children: [
      {
        element: <PublicLayout />,
        children: [{ index: true, element: <HomePage />, handle: { title: 'Inicio' } }],
      },
      // Las vistas de acceso usan AuthShell (dos columnas), sin la cabecera pública.
      { path: 'ingresar', element: <LoginPage />, handle: { title: 'Ingresar' } },
      { path: 'registro', element: <RegisterPage />, handle: { title: 'Crear cuenta' } },
      { path: 'activar-cuenta', element: <ActivateAccountPage />, handle: { title: 'Activar cuenta' } },
      { path: 'recuperar-acceso', element: <RecoverAccessPage />, handle: { title: 'Recuperar acceso' } },
      { path: 'restablecer-contrasena', element: <ResetPasswordPage />, handle: { title: 'Restablecer contraseña' } },
      { path: 'verificar-identidad', element: <VerifyIdentityPage />, handle: { title: 'Verifica tu identidad' } },
      { path: 'verificar-correo', element: <VerifyEmailPage />, handle: { title: 'Verificar correo' } },
      { path: 'cambiar-correo', element: <ConfirmEmailChangePage />, handle: { title: 'Confirmar cambio de correo' } },
      { path: 'invitacion-administrador', element: <AdminInvitationPage />, handle: { title: 'Invitación de administrador' } },
      // Enlace de invitación del correo (LINK-01), fuera del área autenticada.
      { path: 'invitaciones', element: <InvitationLinkPage />, handle: { title: 'Invitación' } },
      // Área del donante. Sin backend (D-4) todavía no hay guard de sesión.
      {
        path: 'donante',
        element: <DonorLayout />,
        handle: { area: 'Donante' },
        children: [
          { index: true, element: <Navigate to="invitaciones" replace /> },
          { path: 'invitaciones', element: <InvitationsPage />, handle: { title: 'Mis invitaciones' } },
          { path: 'invitaciones/:invitationId', element: <InvitationDetailPage />, handle: { title: 'Detalle de invitación' } },
          { path: 'bienvenida', element: <OnboardingPage />, handle: { title: 'Completa tu perfil' } },
          { path: 'perfil', element: <ProfilePage />, handle: { title: 'Mi perfil' } },
          { path: 'historial', element: <HistoryPage />, handle: { title: 'Historial de respuestas' } },
          { path: 'solicitudes', element: <RequestsPage />, handle: { title: 'Mis solicitudes' } },
          { path: 'solicitudes/nueva', element: <NewRequestPage />, handle: { title: 'Nueva solicitud' } },
        ],
      },
      // Área del hospital. Sin backend (D-4) todavía no hay guard de sesión.
      {
        path: 'hospital',
        element: <HospitalLayout />,
        handle: { area: 'Hospital' },
        children: [
          { index: true, element: <SummaryPage />, handle: { title: 'Resumen' } },
          { path: 'necesidades', element: <NeedsPage />, handle: { title: 'Necesidades' } },
          { path: 'necesidades/nueva', element: <CreateNeedPage />, handle: { title: 'Crear necesidad' } },
          { path: 'necesidades/:needId', element: <NeedDetailPage />, handle: { title: 'Detalle de necesidad' } },
          { path: 'necesidades/:needId/respuestas', element: <ResponsesPage />, handle: { title: 'Respuestas' } },
          { path: 'necesidades/:needId/lotes', element: <BatchesPage />, handle: { title: 'Lotes de invitación' } },
          { path: 'altas', element: <AssistedSignupsPage />, handle: { title: 'Altas asistidas' } },
        ],
      },
      // Área del superadmin. Sin backend (D-4) todavía no hay guard de sesión ni AAL2.
      {
        path: 'superadmin',
        element: <SuperadminLayout />,
        handle: { area: 'Superadmin' },
        children: [
          { index: true, element: <TasksPage />, handle: { title: 'Tareas' } },
          { path: 'hospitales', element: <HospitalsPage />, handle: { title: 'Hospitales autorizados' } },
          { path: 'sedes', element: <SitesPage />, handle: { title: 'Sedes' } },
          { path: 'administradores', element: <AdminsPage />, handle: { title: 'Administradores y membresías' } },
          { path: 'solicitudes', element: <AdminRequestsPage />, handle: { title: 'Solicitudes' } },
          { path: 'solicitudes/:requestId', element: <RequestDetailPage />, handle: { title: 'Detalle de solicitud' } },
          { path: 'configuracion', element: <ConfigurationPage />, handle: { title: 'Configuración' } },
          { path: 'auditoria', element: <AuditPage />, handle: { title: 'Auditoría' } },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Recurso no disponible' } },
    ],
  },
];
