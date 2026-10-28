// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { getAuthSession } from '../session/session.js';

setupRender();
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const csrf = { data: { token: 'token-csrf-sintetico-de-prueba-000000' } };
const successMessage = /Sesión iniciada/i;
const failureMessage = /no se pudo|no fue posible|intenta|error/i;
const unverifiedSessionWarning = 'Este intento no verificó la sesión localmente. Puede quedar una sesión activa en el servidor.';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function waitForLive(view: Element, pattern: RegExp): Promise<string> {
  const live = view.querySelector('[aria-live="polite"]')!;
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const text = live.textContent ?? '';
      if (pattern.test(text)) { observer.disconnect(); resolve(text); }
    });
    observer.observe(live, { childList: true, subtree: true, characterData: true });
  });
}

function outsideLive(view: Element): string {
  const copy = view.cloneNode(true) as Element;
  copy.querySelector('[aria-live="polite"]')?.remove();
  return copy.textContent ?? '';
}

function fillLogin(view: Element) {
  const [email, password] = [...view.querySelectorAll('input')];
  type(email, ' persona@ejemplo.test ');
  type(password, 'clave-sintetica');
}

function submit(view: Element): HTMLButtonElement {
  const button = view.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error('No se encontró el botón de ingreso.');
  click(button);
  return button;
}

describe('AUTH-01 Inicio de sesión', () => {
  it('tiene un solo h1 y el aviso de uso académico', () => {
    const view = renderRoute('/ingresar');
    expect([...view.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Iniciar sesión']);
    expect(view.textContent).toContain('No ingreses datos reales en este prototipo.');
  });

  it.each(['donante', 'admin_hospitalario', 'superadmin'] as const)(
    'confirma sesión y CSRF sin mostrar datos ni navegar para el rol %s', async (role) => {
      vi.useFakeTimers();
      const login = deferred<Response>(), csrfReply = deferred<Response>(), csrfRequested = deferred<boolean>();
      const requests: Array<{ url: string; init?: RequestInit }> = [];
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith('/sessions')) return login.promise;
        csrfRequested.resolve(true);
        return csrfReply.promise;
      });
      const view = renderRoute('/ingresar');
      const before = outsideLive(view), storage = [localStorage.length, sessionStorage.length];
      const actor = { role, displayName: 'Persona sintética', ...(role === 'admin_hospitalario' ? { hospitalName: 'Hospital sintético' } : {}) };
      const session = { data: { actor, aal: 1, mfaRequired: role !== 'donante' } };
      fillLogin(view);
      submit(view);
      expect(requests).toHaveLength(1);

      const post = requests[0]!, headers = new Headers(post.init?.headers);
      expect(post.url).toBe('/api/v1/auth/sessions');
      expect(post.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
      expect(String(headers.get('content-type'))).toMatch(/application\/json/i);
      expect(JSON.parse(String(post.init?.body))).toEqual({ email: 'persona@ejemplo.test', password: 'clave-sintetica' });
      expect(headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16);
      expect(headers.get('idempotency-key')?.length).toBeLessThanOrEqual(255);

      const acknowledged = waitForLive(view, successMessage);
      await act(async () => { login.resolve(jsonResponse(session)); await csrfRequested.promise; });
      expect(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions', '/api/v1/auth/csrf-token']);
      expect(requests[1]?.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
      expect(requests[1]?.init?.method ?? 'GET').toBe('GET');
      expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toMatch(successMessage);
      await act(async () => { csrfReply.resolve(jsonResponse(csrf)); await acknowledged; });

      const message = view.querySelector('[aria-live="polite"]')?.textContent ?? '';
      expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
      expect(outsideLive(view)).toBe(before);
      expect(message).not.toContain(actor.displayName);
      expect(message).not.toContain(role);
      expect(message).not.toContain(unverifiedSessionWarning);
      if ('hospitalName' in actor) expect(message).not.toContain(actor.hospitalName);
      expect([localStorage.length, sessionStorage.length]).toEqual(storage);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('usa una clave nueva por envío explícito, sin reintento diferido', async () => {
    vi.useFakeTimers();
    const first = deferred<Response>(), second = deferred<Response>();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return requests.length === 1 ? first.promise : second.promise;
    });
    const view = renderRoute('/ingresar');
    fillLogin(view);
    submit(view);
    expect(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions']);
    const error = waitForLive(view, failureMessage);
    await act(async () => { first.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)); await error; });
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);

    const [, password] = [...view.querySelectorAll('input')];
    type(password, 'clave-sintetica');
    submit(view);
    const keys = requests.map(({ init }) => new Headers(init?.headers).get('idempotency-key'));
    expect(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions', '/api/v1/auth/sessions']);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((key) => key !== null && key.length >= 16 && key.length <= 255)).toBe(true);
    const retryFailed = waitForLive(view, failureMessage);
    await act(async () => { second.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)); await retryFailed; });
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(unverifiedSessionWarning);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['rechazo del servidor', 'server'],
    ['fallo de red', 'network'],
  ] as const)('rechaza de forma segura y sin reintento un %s', async (_label, failure) => {
    vi.useFakeTimers();
    const reply = deferred<Response>(), requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => { requests.push(String(input)); return reply.promise; });
    const view = renderRoute('/ingresar'), before = outsideLive(view), storage = [localStorage.length, sessionStorage.length];
    fillLogin(view);
    submit(view);
    expect(requests).toEqual(['/api/v1/auth/sessions']);
    const failed = waitForLive(view, failureMessage);
    await act(async () => {
      if (failure === 'network') reply.reject(new Error('Fallo de red sintético.'));
      else reply.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
      await failed;
    });
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(unverifiedSessionWarning);
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(outsideLive(view)).toBe(before);
    expect(view.textContent).not.toMatch(/Persona sintética|AUTHENTICATION_REQUIRED|Fallo de red sintético/);
    expect([localStorage.length, sessionStorage.length]).toEqual(storage);
  });

  it('no confirma sesión ni conserva estado si falla el bootstrap CSRF', async () => {
    vi.useFakeTimers();
    const login = deferred<Response>(), csrfReply = deferred<Response>(), csrfRequested = deferred<boolean>();
    const requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input); requests.push(url);
      if (url.endsWith('/sessions')) return login.promise;
      csrfRequested.resolve(true); return csrfReply.promise;
    });
    const view = renderRoute('/ingresar'), before = outsideLive(view), storage = [localStorage.length, sessionStorage.length];
    fillLogin(view);
    submit(view);
    expect(requests).toEqual(['/api/v1/auth/sessions']);
    await act(async () => { login.resolve(jsonResponse({ data: { actor: { role: 'donante', displayName: 'Persona sintética' }, aal: 1, mfaRequired: false } })); await csrfRequested.promise; });
    expect(requests).toEqual(['/api/v1/auth/sessions', '/api/v1/auth/csrf-token']);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toMatch(successMessage);
    const failed = waitForLive(view, failureMessage);
    await act(async () => { csrfReply.resolve(jsonResponse({}, 503)); await failed; });
    const message = view.querySelector('[aria-live="polite"]')?.textContent ?? '';
    expect(message).toContain(unverifiedSessionWarning);
    expect(message).not.toContain('Sesión iniciada');
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(outsideLive(view)).toBe(before);
    expect(view.textContent).not.toContain('Persona sintética');
    expect([localStorage.length, sessionStorage.length]).toEqual(storage);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['malformed login DTO', 'login', ['/api/v1/auth/sessions']],
    ['malformed CSRF response', 'csrf', ['/api/v1/auth/sessions', '/api/v1/auth/csrf-token']],
  ] as const)('keeps %s unverified without leaking data or retrying', async (_label, failedAt, expectedRequests) => {
    vi.useFakeTimers();
    const requests: string[] = [];
    const session = { data: { actor: { role: 'superadmin', displayName: 'Persona sintética' }, aal: 1, mfaRequired: true } };
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input); requests.push(url);
      if (url.endsWith('/sessions')) return Promise.resolve(jsonResponse(
        failedAt === 'login' ? { data: { ...session.data, aal: 3 } } : session,
      ));
      return Promise.resolve(jsonResponse({ data: { token: 'corto' } }));
    });
    const view = renderRoute('/ingresar'), before = outsideLive(view), storage = [localStorage.length, sessionStorage.length];
    fillLogin(view);
    submit(view);
    const failed = waitForLive(view, failureMessage);
    await act(async () => { await failed; });
    const message = view.querySelector('[aria-live="polite"]')?.textContent ?? '';
    expect(message).toContain(unverifiedSessionWarning);
    expect(message).not.toContain('Sesión iniciada');
    expect(message).not.toMatch(/superadmin|Persona sintética/);
    expect(requests).toEqual(expectedRequests);
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(outsideLive(view)).toBe(before);
    expect([localStorage.length, sessionStorage.length]).toEqual(storage);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('deshabilita el envío pendiente e ignora un segundo envío', async () => {
    vi.useFakeTimers();
    const reply = deferred<Response>();
    const requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => { requests.push(String(input)); return reply.promise; });
    const view = renderRoute('/ingresar');
    fillLogin(view);
    const button = submit(view);
    expect(requests).toEqual(['/api/v1/auth/sessions']);
    expect(button.disabled).toBe(true);
    submit(view);
    expect(requests).toHaveLength(1);
    const failed = waitForLive(view, failureMessage);
    await act(async () => { reply.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)); await failed; });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('impide logins superpuestos tras navegar y permite un nuevo envío explícito', async () => {
    const loginReplies: Array<ReturnType<typeof deferred<Response>>> = [];
    const csrfReplies: Array<ReturnType<typeof deferred<Response>>> = [];
    const csrfStarted = [deferred<boolean>(), deferred<boolean>()];
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, init });
      if (url.endsWith('/sessions')) {
        const reply = deferred<Response>(); loginReplies.push(reply); return reply.promise;
      }
      const reply = deferred<Response>();
      const index = csrfReplies.push(reply) - 1;
      csrfStarted[index]?.resolve(true);
      return reply.promise;
    });
    const view = renderRoute('/ingresar');
    fillLogin(view); submit(view);
    const firstKey = new Headers(requests[0]?.init?.headers).get('idempotency-key');
    click(view.querySelector('a[href="/recuperar-acceso"]'));
    expect.soft(view.querySelector('h1')?.textContent).toBe('Solicitar enlace de recuperación');
    click(view.querySelector('a[href="/ingresar"]'));
    expect.soft(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    fillLogin(view); submit(view);
    expect.soft(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions']);
    const postsWhilePending = loginReplies.length;

    const firstSession = { data: { actor: { role: 'donante', displayName: 'Primera persona sintética' }, aal: 1, mfaRequired: false } };
    await act(async () => {
      loginReplies[0]!.resolve(jsonResponse(firstSession));
      await csrfStarted[0]!.promise;
      csrfReplies[0]!.resolve(jsonResponse(csrf));
    });
    const firstMemory = { role: 'donante', aal: 1, mfaRequired: false, csrfToken: csrf.data.token };
    expect.soft(getAuthSession()).toEqual(firstMemory);
    expect.soft(loginReplies).toHaveLength(postsWhilePending);
    expect.soft(csrfReplies).toHaveLength(1);
    if (loginReplies[1]) {
      const failed = waitForLive(view, failureMessage);
      await act(async () => {
        loginReplies[1]!.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
        await failed;
      });
      expect.soft(getAuthSession()).toEqual(firstMemory);
    }

    const nextPost = loginReplies.length, nextCsrf = csrfReplies.length;
    fillLogin(view); submit(view);
    const sessionRequests = requests.filter(({ url }) => url.endsWith('/sessions'));
    const freshKey = new Headers(sessionRequests[sessionRequests.length - 1]?.init?.headers).get('idempotency-key');
    expect(freshKey).not.toBe(firstKey);
    const secondCsrf = { data: { token: 'token-csrf-segunda-sesion-sintetico-000000' } };
    const secondSession = { data: { actor: { role: 'superadmin', displayName: 'Segunda persona sintética' }, aal: 1, mfaRequired: true } };
    const success = waitForLive(view, successMessage);
    await act(async () => {
      loginReplies[nextPost]!.resolve(jsonResponse(secondSession));
      await csrfStarted[nextCsrf]!.promise;
      csrfReplies[nextCsrf]!.resolve(jsonResponse(secondCsrf));
      await success;
    });
    expect(getAuthSession()).toEqual({ role: 'superadmin', aal: 1, mfaRequired: true, csrfToken: secondCsrf.data.token });
  });

  it('muestra el fallo del login original tras remonte y permite un nuevo intento', async () => {
    const loginReplies: Array<ReturnType<typeof deferred<Response>>> = [];
    const csrfReply = deferred<Response>(), csrfRequested = deferred<boolean>();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, init });
      if (url.endsWith('/sessions')) {
        const reply = deferred<Response>(); loginReplies.push(reply); return reply.promise;
      }
      csrfRequested.resolve(true); return csrfReply.promise;
    });
    const view = renderRoute('/ingresar');
    fillLogin(view); submit(view);
    const originalKey = new Headers(requests[0]?.init?.headers).get('idempotency-key');
    click(view.querySelector('a[href="/recuperar-acceso"]'));
    expect.soft(view.querySelector('h1')?.textContent).toBe('Solicitar enlace de recuperación');
    click(view.querySelector('a[href="/ingresar"]'));
    expect.soft(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect.soft(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions']);

    await act(async () => {
      loginReplies[0]!.resolve(jsonResponse({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
      await loginReplies[0]!.promise;
    });
    const live = view.querySelector('[aria-live="polite"]');
    const message = live?.textContent ?? '';
    expect.soft(live).not.toBeNull();
    expect.soft(message).toContain(unverifiedSessionWarning);
    expect.soft(message).not.toContain('Sesión iniciada');
    expect.soft(getAuthSession()).toBeNull();
    expect.soft(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions']);

    fillLogin(view); submit(view);
    const sessionRequests = requests.filter(({ url }) => url.endsWith('/sessions'));
    const freshKey = new Headers(sessionRequests[sessionRequests.length - 1]?.init?.headers).get('idempotency-key');
    expect(freshKey).not.toBe(originalKey);
    expect.soft(requests.map(({ url }) => url)).toEqual(['/api/v1/auth/sessions', '/api/v1/auth/sessions']);
    const session = { data: { actor: { role: 'donante', displayName: 'Persona sintética' }, aal: 1, mfaRequired: false } };
    const retryCsrf = { data: { token: 'token-csrf-reintento-sintetico-000000' } };
    const success = waitForLive(view, successMessage);
    await act(async () => {
      loginReplies[1]!.resolve(jsonResponse(session));
      await csrfRequested.promise;
      csrfReply.resolve(jsonResponse(retryCsrf));
      await success;
    });
    expect(getAuthSession()).toEqual({ role: 'donante', aal: 1, mfaRequired: false, csrfToken: retryCsrf.data.token });
    expect(requests.map(({ url }) => url)).toEqual([
      '/api/v1/auth/sessions', '/api/v1/auth/sessions', '/api/v1/auth/csrf-token',
    ]);
  });

  it('en desarrollo ofrece entrar al recorrido del donante de prueba', () => {
    const view = renderRoute('/ingresar');
    expect(view.querySelector('a[href="/donante"]')?.textContent).toBe('Entrar como donante de prueba');
    expect(view.querySelector('a[href="/donante/bienvenida"]')?.textContent).toBe('Entrar como donante nuevo');
    expect(view.querySelector('a[href="/hospital"]')?.textContent).toBe('Entrar como hospital de prueba');
    expect(view.querySelector('a[href="/superadmin"]')?.textContent).toBe('Entrar como superadmin de prueba');
  });

  it('ofrece crear cuenta de donante', () => {
    const view = renderRoute('/ingresar');
    expect(view.querySelector('a[href="/registro"]')?.textContent).toBe('Crear cuenta');
  });
});
