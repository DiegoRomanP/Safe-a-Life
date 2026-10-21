import type { RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout.js';
import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { RecoverAccessPage } from '../features/auth/pages/RecoverAccessPage.js';
import { RegisterPage } from '../features/auth/pages/RegisterPage.js';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.js';
import { VerifyIdentityPage } from '../features/auth/pages/VerifyIdentityPage.js';
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
  { path: '*', element: <NotFoundPage /> },
];
