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
  // Las vistas de acceso usan AuthShell (dos columnas), sin la cabecera pública.
  { path: 'ingresar', element: <LoginPage /> },
  { path: 'registro', element: <RegisterPage /> },
  { path: 'activar-cuenta', element: <ActivateAccountPage /> },
  { path: 'recuperar-acceso', element: <RecoverAccessPage /> },
  { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
  { path: 'verificar-identidad', element: <VerifyIdentityPage /> },
  { path: 'verificar-correo', element: <VerifyEmailPage /> },
  { path: 'cambiar-correo', element: <ConfirmEmailChangePage /> },
  // Área del donante. Sin backend (D-4) todavía no hay guard de sesión.
  {
    path: 'donante',
    element: <DonorLayout />,
    children: [
      { index: true, element: <Navigate to="invitaciones" replace /> },
      { path: 'invitaciones', element: <InvitationsPage /> },
      { path: 'invitaciones/:invitationId', element: <InvitationDetailPage /> },
      { path: 'perfil', element: <ProfilePage /> },
      { path: 'historial', element: <HistoryPage /> },
      { path: 'solicitudes', element: <RequestsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
