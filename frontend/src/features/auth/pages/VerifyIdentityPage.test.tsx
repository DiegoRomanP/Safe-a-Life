// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { TEST_DONOR_SESSION, renderRoute } from '../../../test/renderRoute.js';
import { clearAuthSession, expireSession, getAuthSession, logout } from '../session/session.js';

setupRender();
afterEach(() => clearAuthSession());

const CHALLENGE = '8f14e45f-ceea-4e67-a4cd-0f6b3c2d1a10';
const ENROLL_CHALLENGE = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const csrf = { data: { token: 'token-csrf-mfa-sintetico-0000000000000' } };
const adminAal1 = { ...TEST_DONOR_SESSION, role: 'admin_hospitalario', aal: 1, mfaRequired: true } as const;
const withChallenge = { ...adminAal1, mfaChallengeId: CHALLENGE } as const;
const elevated = { data: { actor: { role: 'admin_hospitalario', displayName: 'Persona sintética' }, aal: 2, mfaRequired: false } };

type Call = { url: string; init?: RequestInit };
const reply = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

function stubFetch(handler: (url: string) => ReturnType<typeof reply>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input));
  });
  return calls;
}

function submitCode(view: Element, code: string) {
  type(view.querySelector('input'), code);
  click(view.querySelector('button[type="submit"]'));
}

describe('AUTH-05 MFA', () => {
  it('sin sesión vuelve a /ingresar', async () => {
    const view = renderRoute('/verificar-identidad', null);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
  });

  it('una sesión que ya es aal 2 entra directo a su área', async () => {
    const view = renderRoute('/verificar-identidad', { ...adminAal1, aal: 2, mfaRequired: false });
    await settle();
    // Llegó al área del hospital (su navegación está montada); sus datos los pide el backend, que estas pruebas no simulan.
    expect(view.querySelector('nav[aria-label="Cuenta del hospital"]')).not.toBeNull();
  });

  it('pide un código numérico de un solo uso', () => {
    const view = renderRoute('/verificar-identidad', withChallenge);
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu identidad');
    const input = view.querySelector('input');
    expect(input?.getAttribute('inputmode')).toBe('numeric');
    expect(input?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(view.textContent).toContain('Acceso administrativo');
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Cancelar');
  });

  it.each(['12345', '12a456', '123456789'])('rechaza «%s» sin llamar al backend y enfoca el campo', (code) => {
    const calls = stubFetch(() => reply({}));
    const view = renderRoute('/verificar-identidad', withChallenge);
    const input = view.querySelector('input');
    submitCode(view, code);
    expect(view.textContent).toContain('Ingresa el código de 6 dígitos de tu aplicación.');
    expect(document.activeElement).toBe(input);
    expect(calls).toEqual([]);
  });

  it('un código válido eleva la sesión a aal 2 y abre el área del rol', async () => {
    const calls = stubFetch((url) => (url.endsWith('/auth/mfa-verifications') ? reply(elevated) : reply(csrf)));
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '123 456');
    await settle();

    const [verify, token] = calls;
    expect(verify?.url).toBe('/api/v1/auth/mfa-verifications');
    expect(verify?.init?.method).toBe('POST');
    expect(JSON.parse(String(verify?.init?.body))).toEqual({ challengeId: CHALLENGE, code: '123456' });
    expect(new Headers(verify?.init?.headers).get('x-csrf-token')).toBe(adminAal1.csrfToken);
    // El CSRF va ligado a la sesión: tras elevarla se pide uno nuevo.
    expect(token?.url).toBe('/api/v1/auth/csrf-token');
    expect(getAuthSession()).toMatchObject({ role: 'admin_hospitalario', aal: 2, csrfToken: csrf.data.token });
    expect(getAuthSession()?.mfaChallengeId).toBeUndefined();
    // Llegó al área del hospital (su navegación está montada); sus datos los pide el backend, que estas pruebas no simulan.
    expect(view.querySelector('nav[aria-label="Cuenta del hospital"]')).not.toBeNull();
  });

  it('un código incorrecto (401) avisa, limpia el campo y deja reintentar sin expulsar', async () => {
    stubFetch(() => reply({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '000000');
    await settle();

    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('El código es incorrecto o venció.');
    expect((view.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(getAuthSession()).toMatchObject({ aal: 1 });
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu identidad');
  });

  it('un segundo envío mientras el primero sigue en curso no repite la petición', async () => {
    let answer!: () => void;
    const calls: Call[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/auth/mfa-verifications')) return new Promise((resolve) => { answer = () => resolve(reply(elevated)); });
      return Promise.resolve(reply(csrf));
    });
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '123456');
    click(view.querySelector('button[type="submit"]'));
    expect(calls.filter((c) => c.url.endsWith('/auth/mfa-verifications'))).toHaveLength(1);
    await act(async () => { answer(); });
    await settle();
  });

  it('si la sesión se pierde durante la verificación vuelve a /ingresar, no habla de código incorrecto', async () => {
    let answer!: () => void;
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/mfa-verifications')) return new Promise((resolve) => { answer = () => resolve(reply(elevated)); });
      return Promise.resolve(reply(csrf));
    });
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '123456');
    act(() => { expireSession(); });
    await act(async () => { answer(); });
    await settle();

    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(view.textContent).not.toContain('El código es incorrecto');
    expect(getAuthSession()).toBeNull();
    await logout(); // expireSession deja el estado «expired» a nivel de módulo: se restablece para los demás tests
  });

  it('si el CSRF nuevo falla tras elevar la sesión vuelve a ingresar sin decir que el código fue incorrecto', async () => {
    stubFetch((url) => (url.endsWith('/auth/mfa-verifications') ? reply(elevated) : reply({ error: { code: 'X' } }, 503)));
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '123456');
    await settle();

    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(view.textContent).not.toContain('El código es incorrecto');
    expect(getAuthSession()).toBeNull();
  });

  it('demasiados intentos (429) lo dice sin reintentar', async () => {
    stubFetch(() => reply({ error: { code: 'RATE_LIMITED' } }, 429));
    const view = renderRoute('/verificar-identidad', withChallenge);
    submitCode(view, '000000');
    await settle();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Demasiados intentos');
  });

  describe('sin factor enrolado (primer ingreso)', () => {
    const enrollment = {
      data: {
        factorId: '9b2d7c1e-4a55-4f0e-8a3c-2f6d5e1b7c90',
        otpauthUri: 'otpauth://totp/SaveALife:persona?secret=JBSWY3DPEHPK3PXP&issuer=SaveALife',
        challengeId: ENROLL_CHALLENGE,
      },
    };

    it('ofrece configurar el autenticador, muestra la clave y verifica con el reto del alta', async () => {
      const calls = stubFetch((url) => {
        if (url.endsWith('/auth/mfa-enrollments')) return reply(enrollment, 201);
        if (url.endsWith('/auth/mfa-verifications')) return reply(elevated);
        return reply(csrf);
      });
      const view = renderRoute('/verificar-identidad', adminAal1);
      expect(view.querySelector('input')).toBeNull();
      click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Configurar autenticador') ?? null);
      await settle();

      expect(calls[0]?.url).toBe('/api/v1/auth/mfa-enrollments');
      expect(new Headers(calls[0]?.init?.headers).get('x-csrf-token')).toBe(adminAal1.csrfToken);
      expect(view.textContent).toContain('JBSWY3DPEHPK3PXP');
      expect(document.activeElement).toBe(view.querySelector('input'));

      submitCode(view, '654321');
      await settle();
      expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ challengeId: ENROLL_CHALLENGE, code: '654321' });
      expect(getAuthSession()).toMatchObject({ aal: 2 });
      // Llegó al área del hospital (su navegación está montada); sus datos los pide el backend, que estas pruebas no simulan.
    expect(view.querySelector('nav[aria-label="Cuenta del hospital"]')).not.toBeNull();
    });

    it('si ya hay un factor (409) pide ingresar de nuevo para recibir un reto', async () => {
      stubFetch(() => reply({ error: { code: 'STATE_CONFLICT' } }, 409));
      const view = renderRoute('/verificar-identidad', adminAal1);
      click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Configurar autenticador') ?? null);
      await settle();
      expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Vuelve a ingresar');
      expect(view.querySelector('input')).toBeNull();
    });
  });
});
