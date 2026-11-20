import { vi } from 'vitest';
import { demoProfile, demoRequests } from '../features/donor/demoData.js';
import type { CorrectionRequest, DonorProfile } from '../features/donor/types.js';
import { TEST_DONOR_SESSION } from './renderRoute.js';

export type DonorApiStub = {
  /** Solicitudes de corrección que guarda el «backend». */
  correctionRequests: CorrectionRequest[];
  /** Perfil que guarda el «backend»; `null` = aún sin onboarding (GET 404). */
  profile: DonorProfile | null;
  /** «MÉTODO ruta» de cada petición. */
  requests: string[];
  /** Estado con que responde la lista de solicitudes (p. ej. 503); 200 por defecto. */
  readStatus: number;
  /** Estado con que responden las escrituras (p. ej. 409 o 503); 200 por defecto. */
  writeStatus: number;
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Sustituye `fetch` por un backend en memoria de las tres operaciones reales del perfil del donante. */
export function stubDonorApi(profile: DonorProfile | null = demoProfile): DonorApiStub {
  const stub: DonorApiStub = { profile: profile && structuredClone(profile), requests: [], writeStatus: 200, readStatus: 200, correctionRequests: structuredClone(demoRequests) };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace('/api/v1', '');
    stub.requests.push(`${method} ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.startsWith('/donors/me/correction-requests')) {
      if (method === 'GET' && stub.readStatus !== 200) return reply(stub.readStatus, { error: { code: 'X' } });
      if (method === 'GET') return reply(200, { data: { items: stub.correctionRequests, pagination: { nextCursor: null } } });
      if (new Headers(init?.headers).get('x-csrf-token') !== TEST_DONOR_SESSION.csrfToken) return reply(403, { error: { code: 'CSRF_INVALID' } });
      if (!new Headers(init?.headers).get('idempotency-key')) return reply(400, { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
      if (stub.writeStatus !== 200) return reply(stub.writeStatus, { error: { code: 'X' } });
      const now = new Date().toISOString();
      const fields = body.type === 'eliminacion' ? ['deletion'] : [body.changes.name && 'name', body.changes.newEmail && 'email', body.changes.declaredBloodType && 'declaredBloodType'].filter(Boolean);
      const created = { requestId: crypto.randomUUID(), type: body.type, requestedFields: fields, status: 'pendiente', createdAt: now, updatedAt: now } as CorrectionRequest;
      stub.correctionRequests = [created, ...stub.correctionRequests];
      return reply(201, { data: created });
    }
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
