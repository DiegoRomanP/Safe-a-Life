import { vi } from 'vitest';
import { demoHistory, demoInvitations, demoProfile, demoRequests } from '../features/donor/demoData.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from '../features/donor/types.js';
import { TEST_DONOR_SESSION } from './renderRoute.js';

export type DonorApiStub = {
  /** Invitaciones e historial que guarda el «backend» (la lista se invalida al marcarse no disponible). */
  invitations: DonorInvitation[];
  history: ResponseHistoryItem[];
  /** Solicitudes de corrección que guarda el «backend». */
  correctionRequests: CorrectionRequest[];
  /** Perfil que guarda el «backend»; `null` = aún sin onboarding (GET 404). */
  profile: DonorProfile | null;
  /** «MÉTODO ruta» de cada petición. */
  requests: string[];
  /** El backend real solo acepta la primera respuesta por enlace; en estas pruebas se simula que ya existe un cambio posible. */
  allowFirstResponse: boolean;
  /** Retraso (ms) de las lecturas de invitaciones: deja ver el estado «revalidando» tras una escritura. */
  readDelayMs: number;
  /** Estado con que responde la lista de solicitudes (p. ej. 503); 200 por defecto. */
  readStatus: number;
  /** Estado con que responden las escrituras (p. ej. 409 o 503); 200 por defecto. */
  writeStatus: number;
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Sustituye `fetch` por un backend en memoria de las tres operaciones reales del perfil del donante. */
export function stubDonorApi(profile: DonorProfile | null = demoProfile): DonorApiStub {
  const stub: DonorApiStub = { profile: profile && structuredClone(profile), requests: [], writeStatus: 200, readStatus: 200, allowFirstResponse: false, readDelayMs: 0, correctionRequests: structuredClone(demoRequests), invitations: structuredClone(demoInvitations), history: structuredClone(demoHistory) };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace('/api/v1', '');
    stub.requests.push(`${method} ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const own = url.split('?')[0]!;
    if (own === '/donors/me/invitations' || own === '/donors/me/responses') {
      if (stub.readDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, stub.readDelayMs));
      if (stub.readStatus !== 200) return reply(stub.readStatus, { error: { code: 'X' } });
      const items = own === '/donors/me/responses' ? stub.history : stub.invitations;
      return reply(200, { data: { items, pagination: { nextCursor: null } } });
    }
    const invitation = /^\/donors\/me\/invitations\/([^/]+)(\/response)?$/.exec(own);
    if (invitation) {
      const found = stub.invitations.find((item) => item.invitationId === invitation[1]);
      if (!found) return reply(404, { error: { code: 'RESOURCE_NOT_FOUND' } });
      if (method === 'GET' && stub.readDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, stub.readDelayMs));
      if (method === 'GET') return stub.readStatus !== 200 ? reply(stub.readStatus, { error: { code: 'X' } }) : reply(200, { data: { invitation: found, instructions: found.instructions } });
      // Como el backend: CSRF, Idempotency-Key, la respuesta inicial es solo por enlace y una invitación cerrada no admite cambios.
      if (new Headers(init?.headers).get('x-csrf-token') !== TEST_DONOR_SESSION.csrfToken) return reply(403, { error: { code: 'CSRF_INVALID' } });
      if (!new Headers(init?.headers).get('idempotency-key')) return reply(400, { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
      if (stub.writeStatus !== 200) return reply(stub.writeStatus, { error: { code: 'X' } });
      if (found.response === 'sin_respuesta' && !stub.allowFirstResponse) return reply(409, { error: { code: 'STATE_CONFLICT' } });
      found.response = body.response;
      stub.history = [{ invitationId: found.invitationId, response: body.response, changedAt: new Date().toISOString() }, ...stub.history];
      return reply(200, { data: { response: body.response, recordedAt: new Date().toISOString(), needStatus: 'activa' } });
    }
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
    if (method === 'PATCH' && body.isAvailable === false) {
      stub.invitations = stub.invitations.map((item) => (item.validity === 'activa' && item.response === 'sin_respuesta' ? { ...item, validity: 'invalidada' as const } : item));
    }
    stub.profile = method === 'PUT' ? { email: demoProfile.email, ...body } : { ...stub.profile!, ...body };
    return reply(200, { data: stub.profile });
  });
  return stub;
}
