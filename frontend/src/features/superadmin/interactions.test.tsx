// @vitest-environment jsdom
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupRender, render, click, type } from '../../test/render.js';
import { apiRequest, ApiError } from '../../api/client.js';
import { useAdminAction, useAdminPage } from './components/AdminStates.js';
import { hospitalsPage } from './httpGateway.js';
import { InstitutionForm } from './components/InstitutionForm.js';
import { limaInputToIso } from './format.js';

vi.mock('../../api/client.js', async (load) => {
  const actual = await load<typeof import('../../api/client.js')>();
  return { ...actual, apiRequest: vi.fn() };
});
const savedHospital = { hospitalId: '11111111-1111-4111-8111-111111111101', publicName: 'Hospital sintético', legalName: 'Sociedad sintética', isAuthorized: false, createdAt: '2026-10-22T10:00:00Z' };
setupRender();
afterEach(() => vi.resetAllMocks());
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function DoubleSubmit() {
  const action = useAdminAction();
  return <><button onClick={() => { void action.execute('/api/v1/superadmin/hospitals', 'POST', { publicName: 'Hospital', legalName: 'Sociedad' }); void action.execute('/api/v1/superadmin/hospitals', 'POST', { publicName: 'Hospital', legalName: 'Sociedad' }); }}>Guardar dos veces</button><span>{action.pending ? 'pending' : action.saved ? 'saved' : 'idle'}</span></>;
}
function Pagination() {
  const read = useAdminPage('/api/v1/superadmin/hospitals', hospitalsPage);
  return <><p>{read.items.map((h) => h.publicName).join(',')}</p><button disabled={!read.cursor} onClick={() => { void read.loadMore(); }}>Más</button></>;
}
describe('interacciones HTTP de superadmin', () => {
  it('bloquea un envío duplicado mientras la operación está pendiente', async () => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiRequest).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<MemoryRouter><DoubleSubmit /></MemoryRouter>);
    click(view.querySelector('button'));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain('pending');
    await act(async () => finish?.(savedHospital));
    expect(view.textContent).toContain('saved');
  });
  it('conserva borrador y clave tras error de conexión; una intención cambiada obtiene otra clave', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const view = render(<MemoryRouter><InstitutionForm kind="hospital" onClose={() => {}} onSaved={() => {}} /></MemoryRouter>);
    type(view.querySelector('#institution-name'), 'Hospital sintético');
    type(view.querySelector('#institution-legal'), 'Sociedad sintética');
    const submit = view.querySelector('button[type="submit"]');
    click(submit); await flush();
    expect((view.querySelector('#institution-name') as HTMLInputElement).value).toBe('Hospital sintético');
    const first = vi.mocked(apiRequest).mock.calls[0]?.[1]?.idempotencyKey;
    click(submit); await flush();
    expect(vi.mocked(apiRequest).mock.calls[1]?.[1]?.idempotencyKey).toBe(first);
    type(view.querySelector('#institution-name'), 'Hospital corregido');
    click(submit); await flush();
    expect(vi.mocked(apiRequest).mock.calls[2]?.[1]?.idempotencyKey).not.toBe(first);
  });
  it('solo informa guardado y refresca después de la aceptación del servidor', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(409, 'STATE_CONFLICT')).mockResolvedValueOnce(savedHospital);
    const onSaved = vi.fn();
    const view = render(<MemoryRouter><InstitutionForm kind="hospital" onClose={() => {}} onSaved={onSaved} /></MemoryRouter>);
    type(view.querySelector('#institution-name'), 'Hospital sintético');
    type(view.querySelector('#institution-legal'), 'Sociedad sintética');
    click(view.querySelector('button[type="submit"]')); await flush();
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.textContent).toContain('Conflicto');
    click(view.querySelector('button[type="submit"]')); await flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiRequest).mock.calls[1]?.[1]?.body).toEqual({ publicName: 'Hospital sintético', legalName: 'Sociedad sintética' });
  });
  it('conserva borrador y clave cuando una respuesta exitosa tiene datos inválidos', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({}).mockResolvedValueOnce(savedHospital);
    const onSaved = vi.fn();
    const view = render(<MemoryRouter><InstitutionForm kind="hospital" onClose={() => {}} onSaved={onSaved} /></MemoryRouter>);
    type(view.querySelector('#institution-name'), 'Hospital sintético');
    type(view.querySelector('#institution-legal'), 'Sociedad sintética');
    click(view.querySelector('button[type="submit"]')); await flush();
    expect(onSaved).not.toHaveBeenCalled();
    expect((view.querySelector('#institution-name') as HTMLInputElement).value).toBe('Hospital sintético');
    expect(view.textContent).toContain('No se pudo confirmar el resultado');
    expect(view.textContent).not.toContain('El servidor aceptó la operación');
    const firstKey = vi.mocked(apiRequest).mock.calls[0]?.[1]?.idempotencyKey;
    click(view.querySelector('button[type="submit"]')); await flush();
    expect(vi.mocked(apiRequest).mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect((view.querySelector('#institution-name') as HTMLInputElement).value).toBe('');
  });
  it('consulta las páginas siguientes con su cursor sin repetir la primera', async () => {
    const h = (id: string) => ({ hospitalId: id, publicName: id, legalName: id, isAuthorized: false, createdAt: '2026-10-22T10:00:00Z' });
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [h('h1')], pagination: { nextCursor: 'cursor/opaque' } }).mockResolvedValueOnce({ items: [h('h2')], pagination: { nextCursor: null } });
    const view = render(<MemoryRouter><Pagination /></MemoryRouter>);
    await flush();
    click(view.querySelector('button')); await flush();
    expect(view.textContent).toContain('h1,h2');
    expect(vi.mocked(apiRequest).mock.calls[1]?.[0]).toBe('/api/v1/superadmin/hospitals?limit=20&cursor=cursor%2Fopaque');
  });
  it('interpreta el calendario como Lima y rechaza días normalizados', () => {
    expect(limaInputToIso('2026-10-21T23:30')).toBe('2026-10-22T04:30:00.000Z');
    expect(limaInputToIso('2026-02-30T10:00')).toBeNull();
    expect(limaInputToIso('')).toBeNull();
  });
});



