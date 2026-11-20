import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../app/routes.js';
import { clearAuthSession, setAuthSession, type AuthSessionMemory } from '../features/auth/session/session.js';
import { render } from './render.js';

export const TEST_DONOR_SESSION: AuthSessionMemory = { role: 'donante', aal: 1, mfaRequired: false, csrfToken: 'csrf-sintetico-de-prueba-'.padEnd(40, '0') };

export const TEST_HOSPITAL_SESSION: AuthSessionMemory = { ...TEST_DONOR_SESSION, role: 'admin_hospitalario', aal: 2 };
export const TEST_SUPERADMIN_SESSION: AuthSessionMemory = { ...TEST_DONOR_SESSION, role: 'superadmin', aal: 2 };

const SEEDED_AREAS: ReadonlyArray<readonly [string, AuthSessionMemory]> = [
  ['/donante', TEST_DONOR_SESSION],
  ['/hospital', TEST_HOSPITAL_SESSION],
  ['/superadmin', TEST_SUPERADMIN_SESSION],
];

// Monta la app completa en una ruta, con un router en memoria. Las áreas /donante, /hospital y /superadmin exigen sesión (RequireRole): se siembra una
// sintética del rol (aal 2 en los administrativos) salvo que la prueba pase otra o `null` (sin sesión).
export function renderRoute(path: string, session?: AuthSessionMemory | null): HTMLDivElement {
  const seeded = session === undefined ? SEEDED_AREAS.find(([area]) => path.startsWith(area))?.[1] : session;
  if (seeded) setAuthSession(seeded);
  else if (seeded === null) clearAuthSession();
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
