import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../app/routes.js';
import { render } from './render.js';

// Monta la app completa en una ruta, con un router en memoria.
export function renderRoute(path: string): HTMLDivElement {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}
