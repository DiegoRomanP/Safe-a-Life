import { act } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { clearAuthSession, logout } from '../features/auth/session/session.js';
import type { AssistedSignup, HospitalNeed, HospitalSite, InvitationBatch, NeedResponse } from '../features/hospital/types.js';
import { demoNeeds, demoSignups, demoSites } from './hospitalFixtures.js';
import { TEST_DONOR_SESSION } from './renderRoute.js';

export type HospitalApiStub = {
  needs: HospitalNeed[];
  sites: HospitalSite[];
  signups: AssistedSignup[];
  /** Lotes y respuestas de cualquier necesidad (el simulador no los separa por necesidad). */
  batches: InvitationBatch[];
  responses: NeedResponse[];
  /** Invitaciones que crea el próximo lote (el servidor elige a los donantes). */
  nextBatchSize: number;
  /** «MÉTODO ruta» de cada petición, en orden. */
  calls: string[];
  /** Cuerpo JSON de cada escritura, por «MÉTODO ruta». */
  bodies: Record<string, unknown[]>;
  /** Si es true, todo el área responde 403 (membresía no activa u hospital no autorizado). */
  forbidden: boolean;
  /** Si no es null, las lecturas responden con ese estado (p. ej. 503). */
  readStatus: number | null;
  /** Si no es null, las escrituras responden con ese estado (p. ej. 409). */
  writeStatus: number | null;
  /** Si no es null, solo los PATCH (transiciones) responden con ese estado. */
  transitionStatus: number | null;
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const error = (status: number, code = 'X') => reply(status, { error: { code, message: 'x', correlationId: 'c' } });
const page = <T,>(items: T[]) => reply(200, { data: { items, pagination: { nextCursor: null } } });

// Transiciones permitidas por el backend (docs/Backend-Contracts.md): las terminales no se reabren.
const ALLOWED: Record<string, string[]> = { borrador: ['activa', 'cancelada'], activa: ['cerrada', 'cancelada'], meta_alcanzada: ['cerrada', 'cancelada'] };

/** Sustituye `fetch` por un backend en memoria de las operaciones del hospital, con CSRF, Idempotency-Key y transiciones como el real. */
export function stubHospitalApi(): HospitalApiStub {
  const stub: HospitalApiStub = {
    needs: structuredClone(demoNeeds),
    sites: structuredClone(demoSites),
    signups: structuredClone(demoSignups),
    batches: [],
    responses: [],
    nextBatchSize: 2,
    calls: [],
    bodies: {},
    forbidden: false,
    readStatus: null,
    writeStatus: null,
    transitionStatus: null,
  };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input).replace('/api/v1', '').split('?')[0]!;
    const key = `${method} ${url}`;
    stub.calls.push(key);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body !== undefined) (stub.bodies[key] ??= []).push(body);

    if (stub.forbidden) return error(403, 'ACCESS_DENIED');
    if (method === 'GET') {
      if (stub.readStatus) return error(stub.readStatus);
      if (url === '/hospitals/me/sites') return page(stub.sites);
      if (url === '/hospitals/me/needs') return page(stub.needs);
      if (url === '/hospitals/me/assisted-signups') return page(stub.signups);
      if (/^\/hospitals\/me\/needs\/[^/]+\/invitation-batches$/.test(url)) return page(stub.batches);
      if (/^\/hospitals\/me\/needs\/[^/]+\/responses$/.test(url)) {
        return reply(200, { data: { confirmedIntentCount: stub.responses.filter((r) => r.response === 'confirmada').length, items: stub.responses, pagination: { nextCursor: null } } });
      }
      return error(404, 'NOT_FOUND');
    }

    // Como el backend: CSRF de la sesión y Idempotency-Key de 16 a 255 caracteres en toda escritura.
    if (headers.get('x-csrf-token') !== TEST_DONOR_SESSION.csrfToken) return error(403, 'CSRF_INVALID');
    const idem = headers.get('idempotency-key') ?? '';
    if (idem.length < 16 || idem.length > 255) return error(400, 'BAD_REQUEST');
    if (stub.writeStatus) return error(stub.writeStatus);

    if (key === 'POST /hospitals/me/needs') {
      // Cuerpo cerrado: el servidor deriva hospital, actor y estado; nunca se aceptan status ni hospitalId.
      const allowed = ['component', 'requiredBloodType', 'targetConfirmations', 'siteId', 'radiusKm', 'urgency', 'expiresInHours'];
      if (Object.keys(body).some((field) => !allowed.includes(field))) return error(400, 'BAD_REQUEST');
      if (!stub.sites.some((site) => site.siteId === body.siteId)) return error(422, 'VALIDATION_ERROR');
      const { expiresInHours, ...rest } = body;
      const created: HospitalNeed = { needId: crypto.randomUUID(), ...rest, confirmedIntentCount: 0, status: 'borrador', expiresAt: new Date(Date.now() + expiresInHours * 3_600_000).toISOString() };
      stub.needs.unshift(created);
      return reply(201, { data: created });
    }
    const transition = /^PATCH \/hospitals\/me\/needs\/([^/]+)$/.exec(key);
    if (transition) {
      if (stub.transitionStatus) return error(stub.transitionStatus);
      const target = stub.needs.find((need) => need.needId === transition[1]);
      if (!target) return error(404, 'NOT_FOUND');
      if (!['activa', 'cerrada', 'cancelada'].includes(body.status)) return error(422, 'VALIDATION_ERROR');
      if (!ALLOWED[target.status]?.includes(body.status)) return error(409, 'STATE_CONFLICT');
      target.status = body.status;
      return reply(200, { data: target });
    }
    const batch = /^POST \/hospitals\/me\/needs\/([^/]+)\/invitation-batches$/.exec(key);
    if (batch) {
      const target = stub.needs.find((need) => need.needId === batch[1]);
      if (!target) return error(404, 'NOT_FOUND');
      if (target.status !== 'activa') return error(409, 'STATE_CONFLICT');
      const created = { batchId: crypto.randomUUID(), createdAt: new Date().toISOString(), createdInvitationCount: stub.nextBatchSize, deliveryCounts: { pendiente: stub.nextBatchSize, enviada: 0, entregada: 0, fallida: 0 } };
      stub.batches.push(created);
      return reply(201, { data: { batchId: created.batchId, createdInvitationCount: stub.nextBatchSize, queuedEmailCount: stub.nextBatchSize } });
    }
    if (key === 'POST /hospitals/me/assisted-signups') {
      const createdAt = new Date().toISOString();
      const created: AssistedSignup = { signupId: crypto.randomUUID(), status: 'pendiente', createdAt, activationExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), purgeAt: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString() };
      stub.signups.unshift(created);
      return reply(202, { data: created });
    }
    const reissue = /^POST \/hospitals\/me\/assisted-signups\/([^/]+)\/activation-links$/.exec(key);
    if (reissue) {
      const target = stub.signups.find((signup) => signup.signupId === reissue[1]);
      if (!target) return error(404, 'NOT_FOUND');
      target.status = 'pendiente';
      target.activationExpiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
      return reply(202, { data: { message: 'Si la solicitud puede procesarse, recibirás instrucciones.' } });
    }
    return error(404, 'NOT_FOUND');
  });
  return stub;
}

/** Registra el ciclo de una prueba con el backend del hospital: uno nuevo por prueba y la sesión vuelve a reposo al terminar. */
export function registerHospitalApi(): () => HospitalApiStub {
  let api!: HospitalApiStub;
  beforeEach(() => { api = stubHospitalApi(); });
  afterEach(async () => { clearAuthSession(); await act(async () => { await logout(); }); });
  return () => api;
}
