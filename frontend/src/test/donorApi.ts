import { vi } from 'vitest';
import { demoProfile } from '../features/donor/demoData.js';
import type { DonorProfile } from '../features/donor/types.js';
import { TEST_DONOR_SESSION } from './renderRoute.js';

export type DonorApiStub = {
  /** Perfil que guarda el «backend»; `null` = aún sin onboarding (GET 404). */
  profile: DonorProfile | null;
  /** «MÉTODO ruta» de cada petición. */
  requests: string[];
  /** Estado con que responden las escrituras (p. ej. 409 o 503); 200 por defecto. */
  writeStatus: number;
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Sustituye `fetch` por un backend en memoria de las tres operaciones reales del perfil del donante. */
export function stubDonorApi(profile: DonorProfile | null = demoProfile): DonorApiStub {
  const stub: DonorApiStub = { profile: profile && structuredClone(profile), requests: [], writeStatus: 200 };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace('/api/v1', '');
    stub.requests.push(`${method} ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url !== '/donors/me/profile' && url !== '/donors/me/onboarding-profile') return reply(404, { error: { code: 'NOT_FOUND' } });
    if (method === 'GET') return stub.profile ? reply(200, { data: stub.profile }) : reply(404, { error: { code: 'NOT_FOUND' } });
    // Como el backend (csrf-guard): una escritura sin el token de la sesión se rechaza.
    if (new Headers(init?.headers).get('x-csrf-token') !== TEST_DONOR_SESSION.csrfToken) return reply(403, { error: { code: 'CSRF_INVALID' } });
    if (stub.writeStatus !== 200) return reply(stub.writeStatus, { error: { code: 'X' } });
    stub.profile = method === 'PUT' ? { email: demoProfile.email, ...body } : { ...stub.profile!, ...body };
    return reply(200, { data: stub.profile });
  });
  return stub;
}
