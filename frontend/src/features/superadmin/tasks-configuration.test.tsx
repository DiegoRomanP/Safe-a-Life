// @vitest-environment jsdom
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../api/client.js';
import { click, render, setupRender, type } from '../../test/render.js';
import { TasksPage } from './pages/TasksPage.js';
import { ConfigurationPage } from './pages/ConfigurationPage.js';
vi.mock('../../api/client.js', async (load) => ({ ...await load<typeof import('../../api/client.js')>(), apiRequest: vi.fn() }));
setupRender();
afterEach(() => vi.resetAllMocks());
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
it('dirige la revisión institucional a las sedes sin inventar ceros de otras clases', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ taskId: 'sede-prueba', kind: 'hospital_review', resourceCode: 'OPACO', createdAt: '2026-10-22T10:00:00Z' }] });
  const view = render(<MemoryRouter><TasksPage /></MemoryRouter>); await flush();
  expect(view.querySelector('a')?.getAttribute('href')).toBe('/superadmin/sedes');
  expect(view.textContent).not.toContain('Fallo de entrega');
  expect(view.textContent).not.toContain('Política de reconocimiento');
});
it('no ofrece una ruta falsa de moderación aunque el servidor devuelva esa clase', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ taskId: 'politica-prueba', kind: 'recognition_policy', resourceCode: 'OPACO', createdAt: '2026-10-22T10:00:00Z' }] });
  const view = render(<MemoryRouter><TasksPage /></MemoryRouter>); await flush();
  expect(view.querySelector('a')).toBeNull();
  expect(view.textContent).toContain('pendiente de integración');
});
it('exige confirmación de la fecha fija y la invalida al cambiar el borrador', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ finalDemoAt: null, isImmutable: false });
  const view = render(<MemoryRouter><ConfigurationPage /></MemoryRouter>); await flush();
  const submit = view.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  type(view.querySelector('#sa-final-date'), '2026-12-30T18:00');
  expect(submit.disabled).toBe(true);
  click(view.querySelector('#sa-final-confirm')); expect(submit.disabled).toBe(false);
  type(view.querySelector('#sa-final-date'), '2026-12-31T18:00'); expect(submit.disabled).toBe(true);
  expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => options?.method !== 'PATCH')).toBe(true);
});
