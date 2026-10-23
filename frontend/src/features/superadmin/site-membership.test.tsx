// @vitest-environment jsdom
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupRender, render, click, type } from '../../test/render.js';
import { apiRequest, ApiError } from '../../api/client.js';
import { InstitutionForm } from './components/InstitutionForm.js';
import { AdministratorsPage } from './pages/AdministratorsPage.js';
import { SitesPage } from './pages/SitesPage.js';
import { assertMutationResult } from './httpGateway.js';
import type { Hospital, Site } from './types.js';

vi.mock('../../api/client.js', async (load) => {
  const actual = await load<typeof import('../../api/client.js')>();
  return { ...actual, apiRequest: vi.fn() };
});
const hospital: Hospital = { hospitalId: '11111111-1111-4111-8111-111111111101', publicName: 'Hospital sintético', legalName: 'Sociedad sintética', isAuthorized: true, createdAt: '2026-10-22T10:00:00Z' };
const site: Site = { siteId: '22222222-2222-4222-8222-222222222201', hospitalId: hospital.hospitalId, publicName: 'Sede sintética', publicAddress: 'Dirección sintética', coordinates: { latitude: -12.046374, longitude: -77.042793 }, publicInstructions: 'Ventanilla de prueba', isActive: false, isApproved: true };
const membership = { membershipId: '33333333-3333-4333-8333-333333333301', hospitalId: hospital.hospitalId, emailHint: 'a***@example.test', role: 'admin_hospitalario', status: 'activa' };
setupRender();
afterEach(() => vi.resetAllMocks());
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function button(view: HTMLElement, name: string) { return Array.from(view.querySelectorAll('button')).find((entry) => entry.textContent === name) ?? null; }
function mockReads() {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method === 'PATCH') throw new ApiError(403, 'ACCESS_DENIED');
    return { items: path.includes('/memberships') ? [membership] : [hospital], pagination: { nextCursor: null } } as never;
  });
}

describe('edición de sedes y revocación de membresías', () => {
  it('edita datos públicos de la sede sin cambiar sus ejes de aprobación y actividad', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...site, publicName: 'Sede corregida', publicInstructions: '' });
    const onSaved = vi.fn();
    const view = render(<MemoryRouter><InstitutionForm kind="site" editingSite={site} hospitals={[hospital]} hospitalId={hospital.hospitalId} onClose={() => {}} onSaved={onSaved} /></MemoryRouter>);
    expect((view.querySelector('#institution-address') as HTMLInputElement).value).toBe(site.publicAddress);
    type(view.querySelector('#institution-name'), 'Sede corregida');
    type(view.querySelector('#institution-instructions'), '');
    click(view.querySelector('button[type="submit"]')); await flush();
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/superadmin/sites/' + site.siteId, expect.objectContaining({ method: 'PATCH', body: { publicName: 'Sede corregida', publicAddress: site.publicAddress, coordinates: site.coordinates, publicInstructions: '' } }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
  it('rechaza coordenadas con más de seis decimales antes de enviar', async () => {
    const view = render(<MemoryRouter><InstitutionForm kind="site" editingSite={site} hospitals={[hospital]} hospitalId={hospital.hospitalId} onClose={() => {}} onSaved={() => {}} /></MemoryRouter>);
    type(view.querySelector('#institution-latitude'), '-12.0463749');
    await act(async () => view.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(apiRequest).not.toHaveBeenCalled();
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('valida el DTO de membresía antes de anunciar una revocación', () => {
    expect(() => assertMutationResult('/api/v1/superadmin/memberships/' + membership.membershipId, { ...membership, status: 'revocada' })).not.toThrow();
    expect(() => assertMutationResult('/api/v1/superadmin/memberships/' + membership.membershipId, {})).toThrow();
  });
  it('exige motivo de revocación y conserva borrador y clave cuando falta permiso', async () => {
    mockReads();
    const view = render(<MemoryRouter><AdministratorsPage /></MemoryRouter>); await flush();
    click(button(view, 'Revocar')); await flush();
    const form = view.querySelector('form[aria-label="Revocar membresía"]');
    expect(form).not.toBeNull();
    await act(async () => form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    type(view.querySelector('#sa-membership-reason'), 'Fin de acceso sintético');
    click(form?.querySelector('button[type="submit"]') ?? null); await flush();
    let mutations = vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'PATCH');
    expect(mutations[0]?.[0]).toBe('/api/v1/superadmin/memberships/' + membership.membershipId);
    expect(mutations[0]?.[1]?.body).toEqual({ status: 'revocada', reason: 'Fin de acceso sintético' });
    expect((view.querySelector('#sa-membership-reason') as HTMLInputElement).value).toBe('Fin de acceso sintético');
    expect(view.textContent).toContain('Permiso insuficiente');
    click(form?.querySelector('button[type="submit"]') ?? null); await flush();
    mutations = vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'PATCH');
    expect(mutations[1]?.[1]?.idempotencyKey).toBe(mutations[0]?.[1]?.idempotencyKey);
  });
  it('bloquea revocaciones duplicadas y actualiza el listado solo tras una respuesta válida', async () => {
    let complete: ((value: unknown) => void) | undefined;
    let revoked = false;
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH') return await new Promise<unknown>((resolve) => { complete = resolve; }) as never;
      return { items: path.includes('/memberships') ? [{ ...membership, status: revoked ? 'revocada' : 'activa' }] : [hospital], pagination: { nextCursor: null } } as never;
    });
    const view = render(<MemoryRouter><AdministratorsPage /></MemoryRouter>); await flush();
    click(button(view, 'Revocar')); await flush();
    type(view.querySelector('#sa-membership-reason'), 'Fin de acceso sintético');
    const submit = view.querySelector('form[aria-label="Revocar membresía"] button[type="submit"]');
    click(submit); click(submit);
    expect(vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    revoked = true;
    await act(async () => complete?.({ ...membership, status: 'revocada' })); await flush();
    expect(view.textContent).toContain('Revocada');
    expect(button(view, 'Revocar')).toBeNull();
    click(button(view, 'Cerrar revocación'));
    expect(document.activeElement).toBe(button(view, 'Invitar administrador'));
  });
  it('devuelve el foco a Nueva sede después de cerrar su formulario', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith('/sites') ? { items: [site] } as never : { items: [hospital], pagination: { nextCursor: null } } as never);
    const view = render(<MemoryRouter><SitesPage /></MemoryRouter>); await flush();
    const select = view.querySelector('#sa-site-hospital') as HTMLSelectElement;
    act(() => { select.value = hospital.hospitalId; select.dispatchEvent(new Event('change', { bubbles: true })); }); await flush();
    const trigger = button(view, 'Nueva sede');
    click(trigger);
    expect(document.activeElement).toBe(view.querySelector('#institution-name'));
    click(button(view, 'Cerrar formulario'));
    expect(document.activeElement).toBe(trigger);
  });
  it('devuelve el foco a Revocar al cancelar antes de guardar', async () => {
    mockReads();
    const view = render(<MemoryRouter><AdministratorsPage /></MemoryRouter>); await flush();
    const trigger = button(view, 'Revocar');
    click(trigger);
    expect(document.activeElement).toBe(view.querySelector('#sa-membership-reason'));
    click(button(view, 'Cerrar revocación'));
    expect(document.activeElement).toBe(trigger);
  });

});
