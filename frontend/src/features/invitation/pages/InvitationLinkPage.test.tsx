// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, render, settle, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { InvitationLinkCard } from '../components/InvitationLinkCard.js';

setupRender();

// Token sintético armado en código para que gitleaks no lo marque.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');
const PREVIEW = { hospitalName: 'Hospital Nacional Central', publicSiteName: 'Sede San Borja', intendedAction: 'confirmar', expiresAt: '2026-09-24T23:00:00Z' };

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

type Stub = { calls: string[]; headers: Array<Headers>; preview: () => Response | ReturnType<typeof reply>; respond: () => ReturnType<typeof reply> };
let stub: Stub;

/** Backend simulado de las dos rutas públicas del enlace. */
beforeEach(() => {
  stub = { calls: [], headers: [], preview: () => reply(200, { data: PREVIEW }), respond: () => reply(200, { data: { response: 'confirmada', recordedAt: '2026-09-24T18:00:00Z', needStatus: 'activa' } }) };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    stub.calls.push(`${method} ${String(input).replace('/api/v1', '').replace(TOKEN, '<token>')}`);
    stub.headers.push(new Headers(init?.headers));
    return method === 'GET' ? stub.preview() : stub.respond();
  });
});

const confirmButton = (view: HTMLElement) => [...view.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar intención de asistir') ?? null;

describe('LINK-01 desde el correo', () => {
  it('sin token muestra «Enlace no disponible» y no llama al servidor', async () => {
    const view = renderRoute('/invitaciones');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Enlace no disponible');
    expect(stub.calls).toEqual([]);
  });

  it('abrir el enlace solo pide la vista previa, no registra nada y muestra un solo botón', async () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    expect(stub.calls).toEqual(['GET /invitation-actions/<token>']);
    expect(view.querySelector('h1')?.textContent).toBe('¿Deseas registrar tu intención de asistir?');
    expect(view.textContent).toContain('Enlace seguro · un solo uso');
    expect(view.textContent).toContain('24 sep 2026, 18:00 · Lima, UTC−5');
    expect(view.innerHTML).not.toContain(TOKEN);
    expect([...view.querySelectorAll('main section button')].map((b) => b.textContent)).toEqual(['Confirmar intención de asistir']);
  });

  it('solo muestra los campos de la vista previa del contrato', async () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    expect([...view.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Plazo']);
  });

  it('al responder envía una sola vez con clave de idempotencia, enfoca el resultado y ofrece ingresar', async () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    click(confirmButton(view));
    click(confirmButton(view)); // un segundo clic mientras se envía no repite la respuesta
    await settle();
    expect(stub.calls.filter((call) => call.startsWith('POST'))).toEqual(['POST /invitation-actions/<token>/response']);
    expect(stub.headers.at(-1)?.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16);
    expect(document.activeElement?.textContent).toBe('Registramos tu intención de asistir.');
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Ingresar a mi cuenta');
  });

  it('un enlace de rechazo pregunta y responde en negativo', () => {
    const view = render(
      <MemoryRouter>
        <InvitationLinkCard
          preview={{ hospitalName: 'Hospital Demo', publicSiteName: 'Sede Demo', intendedAction: 'rechazar', expiresAt: '2026-09-24T23:00:00Z' }}
          onConfirm={async () => 'ok'}
          onUnavailable={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(view.querySelector('h1')?.textContent).toBe('¿Confirmas que no podrás asistir?');
    expect(view.querySelector('button')?.textContent).toBe('Confirmar que no podré asistir');
    expect(view.textContent).not.toContain('intención de asistir');
  });

  it('un enlace desconocido (404) se muestra como no disponible', async () => {
    stub.preview = () => reply(404, { error: { code: 'RESOURCE_NOT_FOUND' } });
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('un enlace gastado, cerrado o vencido (410) aclara que ya no admite respuestas', async () => {
    stub.preview = () => reply(410, { error: { code: 'ACTION_UNAVAILABLE' } });
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    expect(view.textContent).toContain('ya no admite respuestas');
    expect(view.querySelector('button')).toBeNull();
  });

  it('si al responder el enlace ya no sirve (410), pasa a «no disponible»', async () => {
    stub.respond = () => reply(410, { error: { code: 'ACTION_UNAVAILABLE' } });
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    click(confirmButton(view));
    await settle();
    expect(view.textContent).toContain('ya no admite respuestas');
    expect(view.textContent).not.toContain('Registramos tu intención');
  });

  it('un fallo del servidor al responder avisa y permite reintentar sin perder la tarjeta', async () => {
    stub.respond = () => reply(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    click(confirmButton(view));
    await settle();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No pudimos registrar tu respuesta');
    expect(confirmButton(view)).not.toBeNull();
  });

  it('un corte de red al abrir el enlace ofrece reintentar y se recupera', async () => {
    stub.preview = () => reply(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    await settle();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No pudimos abrir la invitación');
    stub.preview = () => reply(200, { data: PREVIEW });
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar') ?? null);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('¿Deseas registrar tu intención de asistir?');
  });
});
