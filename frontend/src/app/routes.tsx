import type { RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout.js';
import { LoginPage } from '../features/auth/pages/LoginPage.js';
import { RegisterPage } from '../features/auth/pages/RegisterPage.js';
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
  { path: '*', element: <NotFoundPage /> },
];
