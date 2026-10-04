import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client.js';

const session = {
  actor: { role: 'donante' as const, displayName: 'Donante Demo' },
  aal: 1 as const,
  mfaRequired: false,
};

const profile = {
  name: 'Donante Demo',
  email: 'donante.demo@example.test',
  declaredBloodType: 'O_POS' as const,
  isAvailable: true,
  approximateLocation: { latitude: -12.046, longitude: -77.043 },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('unwraps the OpenAPI data envelope and sends cookie/CSRF mutations safely', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let loginAttempts = 0;
    let profilePatchAttempts = 0;
    let logoutAttempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/auth/sessions')) {
        if (++loginAttempts === 1) throw new TypeError('login response lost');
        return jsonResponse({ data: session });
      }
      if (url.endsWith('/auth/csrf-token')) return jsonResponse({ data: { token: 'synthetic-csrf-token-12345678901234567890123456789012' } });
      if (url.endsWith('/donors/me/profile')) {
        if (init.method === 'PATCH' && ++profilePatchAttempts === 1) throw new TypeError('network failed');
        const requestBody = init.body ? JSON.parse(String(init.body)) as { isAvailable?: boolean } : {};
        return jsonResponse({ data: { ...profile, isAvailable: requestBody.isAvailable ?? profile.isAvailable } });
      }
      if (url.endsWith('/donors/me/invitations')) {
        return jsonResponse({ data: { items: [], pagination: { nextCursor: null } } });
      }
      if (url.endsWith('/auth/sessions/current') && init.method === 'DELETE') {
        if (++logoutAttempts === 1) throw new TypeError('logout response lost');
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ error: { code: 'RESOURCE_NOT_FOUND', message: 'No disponible.', correlationId: 'opaque-id' } }, 404);
    }));

    await expect(api.login('donante.demo@example.test', 'synthetic-demo-only')).rejects.toThrow('login response lost');
    expect(await api.login('donante.demo@example.test', 'synthetic-demo-only')).toEqual(session);
    expect(await api.getDonorProfile()).toEqual(profile);
    expect(await api.getDonorInvitations()).toEqual([]);
    await expect(api.updateDonorProfile({ isAvailable: false })).rejects.toThrow('network failed');
    expect(await api.updateDonorProfile({ isAvailable: false })).toEqual({ ...profile, isAvailable: false });

    const loginRequest = requests.find(({ url }) => url.endsWith('/auth/sessions'))!;
    const loginRequests = requests.filter(({ url }) => url.endsWith('/auth/sessions'));
    expect(loginRequest.init.credentials).toBe('same-origin');
    expect(new Headers(loginRequest.init.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(loginRequest.init.headers).get('Idempotency-Key')).toBeTruthy();
    expect(new Headers(loginRequests[1]!.init.headers).get('Idempotency-Key'))
      .toBe(new Headers(loginRequests[0]!.init.headers).get('Idempotency-Key'));

    const profileMutations = requests.filter(({ url, init }) => url.endsWith('/donors/me/profile') && init.method === 'PATCH');
    const profileMutation = profileMutations[0]!;
    expect(new Headers(profileMutations[1]!.init.headers).get('Idempotency-Key'))
      .toBe(new Headers(profileMutation.init.headers).get('Idempotency-Key'));
    expect(profileMutation.init.credentials).toBe('same-origin');
    expect(new Headers(profileMutation.init.headers).get('X-CSRF-Token')).toContain('synthetic-csrf-token-');
    expect(new Headers(profileMutation.init.headers).get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(profileMutation.init.body))).toEqual({ isAvailable: false });

    await api.logout();
    const logoutRequests = requests.filter(({ url, init }) => url.endsWith('/auth/sessions/current') && init.method === 'DELETE');
    expect(new Headers(logoutRequests[1]!.init.headers).get('Idempotency-Key'))
      .toBe(new Headers(logoutRequests[0]!.init.headers).get('Idempotency-Key'));
  });
});
