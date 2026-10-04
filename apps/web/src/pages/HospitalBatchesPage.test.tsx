// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, type InvitationBatchRecord, type Need } from '../api/client.js';
import { HospitalBatchesPage } from './HospitalPages.js';

const need: Need = {
  needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f', component: 'RBC',
  requiredBloodType: 'O_POS', targetConfirmations: 5, confirmedIntentCount: 0,
  siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261', radiusKm: 10,
  urgency: 'Urgente', status: 'activa', expiresAt: '2099-10-03T18:00:00Z',
};
function record(index: number): InvitationBatchRecord {
  return { batchId: `synthetic-batch-${index}`, createdAt: '2026-10-03T12:00:00Z',
    createdInvitationCount: 0, deliveryCounts: { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 } };
}
function batchPage(items: InvitationBatchRecord[], nextCursor: string | null = null) {
  return { items, pagination: { nextCursor } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api, 'getHospitalNeeds').mockResolvedValue([need]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render() { await act(async () => root.render(<HospitalBatchesPage />)); }
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  expect(result, `button ${label}`).toBeDefined();
  return result!;
}
async function click(label: string) { await act(async () => button(label).click()); }

it('keeps POST success when follow-up GET fails and retries only the read', async () => {
  const get = vi.spyOn(api, 'getHospitalInvitationBatches')
    .mockResolvedValueOnce(batchPage([])).mockRejectedValueOnce(new Error('synthetic GET 500'))
    .mockResolvedValueOnce(batchPage([record(1)])).mockResolvedValue(batchPage([record(1), record(2)]));
  const post = vi.spyOn(api, 'requestHospitalInvitationBatch').mockResolvedValueOnce({
    batchId: record(1).batchId, createdInvitationCount: 0, queuedEmailCount: 0,
  }).mockResolvedValue({
    batchId: record(2).batchId, createdInvitationCount: 0, queuedEmailCount: 0,
  });
  await render();
  await click('Solicitar lote');
  expect(container.textContent).toContain('Solicitud de lote registrada. Invitaciones creadas: 0; correos en cola: 0.');
  expect(container.textContent).toContain('El listado no se pudo actualizar');
  expect(container.textContent).not.toContain('No se registró');
  expect(document.activeElement?.getAttribute('role')).toBe('status');
  expect(button('Solicitar lote').disabled).toBe(true);
  await click('Reintentar lectura');
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(3);
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
  expect(container.textContent).not.toContain('El listado no se pudo actualizar');
  expect(button('Solicitar lote').disabled).toBe(true);
  await click('Preparar otro lote');
  expect(post).toHaveBeenCalledTimes(1);
  expect(button('Solicitar lote').disabled).toBe(false);
  expect(document.activeElement).toBe(button('Solicitar lote'));
  await click('Solicitar lote');
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls.every(([id]) => id === need.needId)).toBe(true);
  expect(get).toHaveBeenCalledTimes(4);
  expect(container.querySelectorAll('.batch-record')).toHaveLength(2);
  expect(button('Solicitar lote').disabled).toBe(true);
});

it('loads over twenty records only on explicit request, deduplicates and resets cursor on refresh', async () => {
  const first = Array.from({ length: 20 }, (_, index) => record(index));
  const get = vi.spyOn(api, 'getHospitalInvitationBatches')
    .mockResolvedValueOnce(batchPage(first, 'synthetic-next'))
    .mockResolvedValueOnce(batchPage([record(19), record(20), record(21)]))
    .mockResolvedValueOnce(batchPage([record(0)], 'synthetic-reset'));
  await render();
  expect(get).toHaveBeenCalledTimes(1);
  expect(container.querySelectorAll('.batch-record')).toHaveLength(20);
  await click('Cargar más lotes');
  expect(get).toHaveBeenLastCalledWith(need.needId, { cursor: 'synthetic-next', limit: 20 });
  expect(container.querySelectorAll('.batch-record')).toHaveLength(22);
  expect(container.textContent).toContain('22 solicitudes de lote mostradas');
  await click('Actualizar lotes');
  expect(get).toHaveBeenLastCalledWith(need.needId, { limit: 20 });
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
});

it('ignores a late page after refresh and retains a scoped cursor for the new first page', async () => {
  const late = deferred<ReturnType<typeof batchPage>>();
  vi.spyOn(api, 'getHospitalInvitationBatches')
    .mockResolvedValueOnce(batchPage([record(0)], 'old-next'))
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce(batchPage([record(10)], 'new-next'));
  await render();
  await click('Cargar más lotes');
  await click('Actualizar lotes');
  await act(async () => late.resolve(batchPage([record(1)])));
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
  expect(button('Cargar más lotes')).toBeDefined();
});

it('shows a read error instead of empty and keeps existing records when a next page fails', async () => {
  const retryPage = deferred<ReturnType<typeof batchPage>>();
  const get = vi.spyOn(api, 'getHospitalInvitationBatches').mockRejectedValueOnce(new Error('GET failed'))
    .mockResolvedValueOnce(batchPage([record(1)], 'next')).mockRejectedValueOnce(new Error('GET failed'))
    .mockReturnValueOnce(retryPage.promise).mockResolvedValueOnce(batchPage([record(2), record(3)]));
  const post = vi.spyOn(api, 'requestHospitalInvitationBatch');
  await render();
  expect(container.textContent).not.toContain('Aún no hay solicitudes');
  await click('Reintentar lectura');
  await click('Cargar más lotes');
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
  expect(container.textContent).toContain('No se pudo cargar la siguiente página');
  expect(document.activeElement?.getAttribute('role')).toBe('status');
  await click('Reintentar lectura');
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
  expect(container.textContent).toContain('Cargando más lotes');
  expect(get.mock.calls[2]?.[1]?.cursor === 'next' && get.mock.calls[3]?.[1]?.cursor === 'next').toBe(true);
  await act(async () => retryPage.resolve(batchPage([record(1), record(2)], 'after-retry')));
  expect(container.querySelectorAll('.batch-record')).toHaveLength(2);
  expect(container.textContent).not.toContain('No se pudo cargar la siguiente página');
  expect(document.activeElement?.getAttribute('role')).toBe('status');
  await click('Cargar más lotes');
  expect(get.mock.calls.at(-1)?.[1]?.cursor === 'after-retry').toBe(true);
  expect(container.querySelectorAll('.batch-record')).toHaveLength(3);
  expect(post).not.toHaveBeenCalled();
});

it('does not let an old need read appear after the page is replaced', async () => {
  const old = deferred<ReturnType<typeof batchPage>>();
  const get = vi.spyOn(api, 'getHospitalInvitationBatches').mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(batchPage([record(10)]));
  await render();
  await act(async () => root.render(<div />));
  vi.mocked(api.getHospitalNeeds).mockResolvedValue([{ ...need, needId: 'synthetic-other-need' }]);
  await render();
  await act(async () => old.resolve(batchPage([record(1)], 'old-scope')));
  expect(get).toHaveBeenLastCalledWith('synthetic-other-need', { limit: 20 });
  expect(container.querySelectorAll('.batch-record')).toHaveLength(1);
  expect(container.textContent).not.toContain('Cargar más lotes');
});

it('announces authoritative POST success before a slow follow-up GET completes', async () => {
  const followUp = deferred<ReturnType<typeof batchPage>>();
  vi.spyOn(api, 'getHospitalInvitationBatches').mockResolvedValueOnce(batchPage([])).mockReturnValueOnce(followUp.promise);
  vi.spyOn(api, 'requestHospitalInvitationBatch').mockResolvedValue({ batchId: record(1).batchId, createdInvitationCount: 0, queuedEmailCount: 0 });
  await render();
  await click('Solicitar lote');
  expect(container.textContent).toContain('Solicitud de lote registrada.');
  expect(container.textContent).toContain('Cargando listado de lotes');
  expect(button('Preparar otro lote').disabled).toBe(true);
  await act(async () => followUp.resolve(batchPage([record(1)])));
  expect(button('Preparar otro lote').disabled).toBe(false);
});

it('locks simultaneous submit events and never claims a failed POST was registered', async () => {
  const get = vi.spyOn(api, 'getHospitalInvitationBatches').mockResolvedValue(batchPage([]));
  const post = vi.spyOn(api, 'requestHospitalInvitationBatch').mockRejectedValue(new Error('synthetic uncertain outcome'));
  await render();
  const submit = button('Solicitar lote');
  await act(async () => { submit.click(); submit.click(); });
  expect(post).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('No se pudo confirmar el registro del lote.');
  expect(container.textContent).not.toContain('Solicitud de lote registrada.');
  expect(document.activeElement?.getAttribute('role')).toBe('alert');
});

it('keeps one need failure and cursor isolated from another need', async () => {
  const secondNeed = { ...need, needId: 'synthetic-second-need', requiredBloodType: 'A_POS' as const };
  vi.mocked(api.getHospitalNeeds).mockResolvedValue([need, secondNeed]);
  const get = vi.spyOn(api, 'getHospitalInvitationBatches').mockImplementation(async (needId) => {
    if (needId === need.needId) throw new Error('synthetic error');
    return batchPage([record(10)], 'second-next');
  });
  await render();
  const groups = container.querySelectorAll('.batch-group');
  expect(groups).toHaveLength(2);
  expect(groups[0]?.textContent).toContain('El listado no se pudo actualizar');
  expect(groups[1]?.querySelectorAll('.batch-record')).toHaveLength(1);
  await click('Cargar más lotes');
  expect(get).toHaveBeenLastCalledWith(secondNeed.needId, { cursor: 'second-next', limit: 20 });
});
