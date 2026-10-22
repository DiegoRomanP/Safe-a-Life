// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { click, render, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { InvitationLinkCard } from '../components/InvitationLinkCard.js';

setupRender();

// Token sintético armado en código para que gitleaks no lo marque.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

describe('LINK-01 desde el correo', () => {
  it('sin token muestra «Enlace no disponible»', () => {
    expect(renderRoute('/invitaciones').querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('abrir el enlace no registra nada y muestra un solo botón de respuesta', () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('¿Deseas registrar tu intención de asistir?');
    expect(view.textContent).toContain('Enlace seguro · un solo uso');
    expect(view.textContent).toContain('24 sep 2026, 18:00 · Lima, UTC−5');
    expect(view.innerHTML).not.toContain(TOKEN);
    const actions = [...view.querySelectorAll('main section button')].map((b) => b.textContent);
    expect(actions).toEqual(['Confirmar intención de asistir']);
  });

  it('solo muestra los campos de la vista previa del contrato', () => {
    const terms = [...renderRoute(`/invitaciones#${TOKEN}`).querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['Plazo']);
  });

  it('al responder enfoca el resultado y ofrece ingresar a la cuenta', () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Confirmar intención de asistir') ?? null);
    expect(document.activeElement?.textContent).toBe('Registramos tu intención de asistir.');
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Ingresar a mi cuenta');
  });

  it('un enlace de rechazo pregunta y responde en negativo', () => {
    const view = render(
      <MemoryRouter>
        <InvitationLinkCard
          preview={{
            hospitalName: 'Hospital Demo',
            publicSiteName: 'Sede Demo',
            intendedAction: 'rechazar',
            expiresAt: '2026-09-24T23:00:00Z',
          }}
        />
      </MemoryRouter>,
    );
    expect(view.querySelector('h1')?.textContent).toBe('¿Confirmas que no podrás asistir?');
    expect(view.querySelector('button')?.textContent).toBe('Confirmar que no podré asistir');
    expect(view.textContent).not.toContain('intención de asistir');
  });

  it('el enlace vencido aclara que no hace falta hacer nada', () => {
    const view = renderRoute(`/invitaciones#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('No necesitas hacer nada más.');
  });
});
