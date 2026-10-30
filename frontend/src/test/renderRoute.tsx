import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../app/routes.js';
import { clearAuthSession, setAuthSession, type AuthSessionMemory } from '../features/auth/session/session.js';
import { render } from './render.js';

export const TEST_DONOR_SESSION: AuthSessionMemory = { role: 'donante', aal: 1, mfaRequired: false, csrfToken: 'csrf-sintetico-de-prueba-'.padEnd(40, '0') };

// Monta la app completa en una ruta, con un router en memoria. El área /donante exige sesión (RequireRole): se siembra una
// de donante sintética salvo que la prueba pase otra o `null` (sin sesión).
export function renderRoute(path: string, session?: AuthSessionMemory | null): HTMLDivElement {
  const seeded = session === undefined && path.startsWith('/donante') ? TEST_DONOR_SESSION : session;
  if (seeded) setAuthSession(seeded);
  else if (seeded === null) clearAuthSession();
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
