// @vitest-environment jsdom
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../../api/client.js';
import { setupRender, render, click, type } from '../../test/render.js';
import { RequestDetailPage } from './pages/RequestDetailPage.js';
import { parseGrant, parseContextualData, createGrant, loadContextualData, executeCorrection } from './privacyGateway.js';

vi.mock('../../api/client.js', async (load) => ({ ...await load<typeof import('../../api/client.js')>(), apiRequest: vi.fn() }));
const requestId = '11111111-1111-4111-8111-111111111111';
const grantId = '22222222-2222-4222-8222-222222222222';
const input = { requestId, action: 'review' as const, allowedFields: ['name' as const], reason: 'Revisión sintética' };
const summary = { requestId, type: 'correccion', requestedFields: ['name'], status: 'pendiente', createdAt: '2026-10-22T10:00:00Z' };
const grant = (seconds = 60) => ({ grantId, requestId, action: 'review' as const, allowedFields: ['name' as const], expiresAt: new Date(Date.now() + seconds * 1000).toISOString() });
setupRender();
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
function page() { return render(<MemoryRouter initialEntries={['/solicitudes/' + requestId]}><Routes><Route path="/solicitudes/:requestId" element={<RequestDetailPage />} /></Routes></MemoryRouter>); }

describe('acceso contextual de Superadmin', () => {
  it('rechaza grants ajenos, con otra acción, campos diferentes o duración excesiva', () => {
    const valid = grant();
    for (const invalid of [{ ...valid, requestId: grantId }, { ...valid, action: 'execute' }, { ...valid, allowedFields: ['email'] }, { ...valid, expiresAt: new Date(Date.now() + 601_000).toISOString() }, { ...valid, expiresAt: new Date(Date.now() - 1).toISOString() }]) {
      expect(() => parseGrant(invalid, input)).toThrow();
    }
    expect(parseGrant(valid, input)).toEqual(valid);
  });
  it('rechaza valores personales que no están autorizados y nunca proyecta campos desconocidos', () => {
    expect(parseContextualData({ currentValues: { name: 'Nombre sintético' }, proposedValues: { name: 'Nombre corregido' } }, ['name']).currentValues).toEqual({ name: 'Nombre sintético' });
    expect(() => parseContextualData({ currentValues: { email: 'oculto@example.test' }, proposedValues: {} }, ['name'])).toThrow();
    expect(() => parseContextualData({ currentValues: { diagnosis: 'campo prohibido' }, proposedValues: {} }, ['name'])).toThrow();
  });
  it('usa únicamente el contrato existente y envía el grant en cabecera', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(grant()).mockResolvedValueOnce({ currentValues: { name: 'Sintético' }, proposedValues: {} });
    const authorized = await createGrant(input, 'intent-1');
    await loadContextualData(requestId, authorized);
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/v1/superadmin/access-grants', expect.objectContaining({ method: 'POST', body: input, idempotencyKey: 'intent-1' }));
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/v1/superadmin/correction-requests/' + requestId + '/donor-data', expect.objectContaining({ headers: { 'X-Contextual-Grant': grantId } }));
  });
  it('no permite ejecutar con un grant de revisión ni con uno vencido', async () => {
    await expect(executeCorrection(requestId, grant(), 'intent-2')).rejects.toBeInstanceOf(ApiError);
    await expect(loadContextualData(requestId, grant(-1))).rejects.toBeInstanceOf(ApiError);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('oculta los valores al cerrar y al expirar el acceso', async () => {
    vi.useFakeTimers();
    vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith('/access-grants') ? grant(1) : path.endsWith('/donor-data') ? { currentValues: { name: 'Nombre privado sintético' }, proposedValues: {} } : summary);
    const view = page(); await flush();
    click(view.querySelector('#sa-field-name'));
    type(view.querySelector('#sa-access-reason'), 'Revisión de prueba');
    click(view.querySelector('#sa-access-submit')); await flush();
    expect(view.textContent).toContain('Nombre privado sintético');
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(view.textContent).not.toContain('Nombre privado sintético');
    expect(view.textContent).toContain('El acceso contextual venció');
  });
  it('no vuelve a mostrar datos cuando una lectura termina después de vencer el grant', async () => {
    vi.useFakeTimers();
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith('/access-grants') ? grant(1) : path.endsWith('/donor-data') ? new Promise((resolve) => { finish = resolve; }) : summary);
    const view = page(); await flush();
    click(view.querySelector('#sa-field-name')); type(view.querySelector('#sa-access-reason'), 'Revisión de prueba');
    click(view.querySelector('#sa-access-submit')); await flush();
    await act(async () => { vi.advanceTimersByTime(1100); });
    await act(async () => { finish?.({ currentValues: { name: 'No debe aparecer' }, proposedValues: {} }); });
    await flush();
    expect(view.textContent).not.toContain('No debe aparecer');
    expect(view.textContent).toContain('El acceso contextual venció');
  });
  it('ejecuta con el grant específico y valida la solicitud devuelta', async () => {
    const executeGrant = { ...grant(), action: 'execute' as const };
    vi.mocked(apiRequest).mockResolvedValueOnce({ ...summary, status: 'completada' }).mockResolvedValueOnce({ ...summary, requestId: grantId });
    const result = await executeCorrection(requestId, executeGrant, 'execution-intent');
    expect(result.status).toBe('completada');
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/v1/superadmin/correction-requests/' + requestId + '/executions', expect.objectContaining({ method: 'POST', idempotencyKey: 'execution-intent', headers: { 'X-Contextual-Grant': grantId } }));
    await expect(executeCorrection(requestId, executeGrant, 'execution-intent')).rejects.toBeInstanceOf(ApiError);
  });
  it.each([401, 403])('oculta inmediatamente los datos si la decisión pierde autorización (%s)', async (status) => {
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH') throw new ApiError(status, status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED');
      if (path.endsWith('/access-grants')) return grant();
      if (path.endsWith('/donor-data')) return { currentValues: { name: 'Valor privado antes del rechazo' }, proposedValues: {} };
      return summary;
    });
    const view = page(); await flush();
    click(view.querySelector('#sa-field-name')); type(view.querySelector('#sa-access-reason'), 'Revisión sintética');
    click(view.querySelector('#sa-access-submit')); await flush();
    expect(view.textContent).toContain('Valor privado antes del rechazo');
    type(view.querySelector('#sa-request-reason'), 'Decisión sintética');
    const form = view.querySelector('#sa-request-reason')?.closest('form');
    click(form?.querySelector('button[type="submit"]') ?? null); await flush();
    expect(view.textContent).not.toContain('Valor privado antes del rechazo');
    expect(view.querySelector('#sa-access-submit')).toBeNull();
  });
  it.each([401, 403])('descarta una lectura tardía tras perder autorización (%s)', async (status) => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH') throw new ApiError(status, status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED');
      if (path.endsWith('/access-grants')) return grant();
      if (path.endsWith('/donor-data')) return new Promise((resolve) => { finish = resolve; });
      return summary;
    });
    const view = page(); await flush();
    click(view.querySelector('#sa-field-name')); type(view.querySelector('#sa-access-reason'), 'Revisión sintética');
    click(view.querySelector('#sa-access-submit')); await flush();
    type(view.querySelector('#sa-request-reason'), 'Decisión sintética');
    const form = view.querySelector('#sa-request-reason')?.closest('form');
    click(form?.querySelector('button[type="submit"]') ?? null); await flush();
    await act(async () => { finish?.({ currentValues: { name: 'Valor tardío que debe descartarse' }, proposedValues: {} }); });
    await flush();
    expect(view.textContent).not.toContain('Valor tardío que debe descartarse');
    expect(view.querySelector('#sa-access-submit')).toBeNull();
  });
  it('conserva el motivo y la misma intención después de un permiso rechazado', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => { if (path.endsWith('/access-grants')) throw new ApiError(403, 'ACCESS_DENIED'); return summary; });
    const view = page(); await flush();
    click(view.querySelector('#sa-field-name')); type(view.querySelector('#sa-access-reason'), 'Motivo sintético');
    click(view.querySelector('#sa-access-submit')); await flush();
    const first = vi.mocked(apiRequest).mock.calls.find(([path]) => path.endsWith('/access-grants'))?.[1]?.idempotencyKey;
    expect((view.querySelector('#sa-access-reason') as HTMLInputElement).value).toBe('Motivo sintético');
    click(view.querySelector('#sa-access-submit')); await flush();
    const calls = vi.mocked(apiRequest).mock.calls.filter(([path]) => path.endsWith('/access-grants'));
    expect(calls[1]?.[1]?.idempotencyKey).toBe(first);
    expect(view.textContent).not.toContain('Nombre privado sintético');
  });
});
