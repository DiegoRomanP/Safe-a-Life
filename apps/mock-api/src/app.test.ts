import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { DemoNeed, DemoState } from './domain/model.js';
import { createDemoState } from './infrastructure/demo-state.js';

const demoPassword = 'synthetic-demo-only';
const appOrigin = 'http://127.0.0.1:5173';
let loginAttempt = 0;

async function login(app: ReturnType<typeof createApp>, email: string) {
  loginAttempt += 1;
  const response = await request(app)
    .post('/api/v1/auth/sessions')
    .set('Idempotency-Key', `synthetic-login-key-${loginAttempt.toString().padStart(4, '0')}`)
    .send({ email, password: demoPassword });

  expect(response.status).toBe(200);
  const setCookie = response.headers['set-cookie'];
  expect(setCookie).toBeDefined();
  const cookie = String(setCookie?.[0]).split(';', 1)[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

async function csrfToken(app: ReturnType<typeof createApp>, cookie: string) {
  const response = await request(app)
    .get('/api/v1/auth/csrf-token')
    .set('Cookie', cookie);

  expect(response.status).toBe(200);
  return response.body.data.token as string;
}

function seedBatches(state: DemoState, need: DemoNeed, count: number) {
  const batches = Array.from({ length: count }, (_, index) => ({
    batchId: `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
    hospitalId: need.hospitalId,
    needId: need.needId,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, Math.floor(index / 2))).toISOString(),
    createdInvitationCount: 0,
    deliveryCounts: { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 },
  }));
  state.invitationBatches.push(...[...batches].reverse());
  return batches.map((batch) => batch.batchId);
}

describe('T2 read purity, terminal replay and batch pagination', () => {
  const needId = '4c117ef2-3ebd-43f2-8629-c06d5c8df68f';
  const foreignNeedId = 'd3ed0c32-264b-4b25-858c-3f8aa1b6678f';
  const invitationId = '8db9b15d-2d84-4c42-97bb-2214571f8301';
  const batchPath = `/api/v1/hospitals/me/needs/${needId}/invitation-batches`;

  it.each([
    ['hospital.demo@example.test', batchPath, 200],
    ['hospital.norte.demo@example.test', batchPath, 404],
    ['hospital.demo@example.test', '/api/v1/hospitals/me/needs?status=vencida', 200],
    ['hospital.demo@example.test', `/api/v1/hospitals/me/needs/${needId}`, 200],
    ['hospital.demo@example.test', `/api/v1/hospitals/me/needs/${foreignNeedId}`, 404],
    ['hospital.demo@example.test', `/api/v1/hospitals/me/needs/${needId}/responses`, 200],
    ['hospital.norte.demo@example.test', `/api/v1/hospitals/me/needs/${needId}/responses`, 404],
    ['pendiente.demo@example.test', '/api/v1/donors/me/invitations', 200],
    ['pendiente.demo@example.test', `/api/v1/donors/me/invitations/${invitationId}`, 200],
    ['alterno.demo@example.test', `/api/v1/donors/me/invitations/${invitationId}`, 404],
  ] as const)('keeps all state identical on read by %s of %s', async (email, path, status) => {
    const state = createDemoState();
    for (const need of state.needs) need.expiresAt = new Date(Date.now() - 1).toISOString();
    const app = createApp(state);
    const cookie = await login(app, email);
    const before = structuredClone(state);

    const result = await request(app).get(path).set('Cookie', cookie);

    expect(result.status).toBe(status);
    expect(state).toEqual(before);
    const again = await request(app).get(path).set('Cookie', cookie);
    expect(again.status).toBe(status);
    if (status === 200) expect(again.body).toEqual(result.body);
    expect(state).toEqual(before);
  });

  it.each(['activa', 'cerrada', 'cancelada', 'vencida'] as const)(
    'projects AP-09 for %s without changing pending or confirmed records', async (status) => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const state = createDemoState();
        const need = state.needs[0]!;
        need.status = status;
        need.expiresAt = new Date(now).toISOString();
        const app = createApp(state);
        const donor = await login(app, 'pendiente.demo@example.test');
        const hospital = await login(app, 'hospital.demo@example.test');
        const before = structuredClone(state);
        const expectedValidity = status === 'cerrada' || status === 'cancelada' ? 'invalidada' : 'vencida';
        const list = await request(app).get('/api/v1/donors/me/invitations').set('Cookie', donor);
        const detail = await request(app).get(`/api/v1/donors/me/invitations/${invitationId}`).set('Cookie', donor);
        const responses = await request(app).get(`/api/v1/hospitals/me/needs/${needId}/responses`).set('Cookie', hospital);
        const needs = await request(app).get('/api/v1/hospitals/me/needs?status=vencida').set('Cookie', hospital);
        const needDetail = await request(app).get(`/api/v1/hospitals/me/needs/${needId}`).set('Cookie', hospital);
        expect([list, detail, responses, needs, needDetail].map((result) => result.status)).toEqual([200, 200, 200, 200, 200]);
        expect(list.body.data.items[0].validity).toBe(expectedValidity);
        expect(detail.body.data.invitation.validity).toBe(expectedValidity);
        expect(responses.body.data.items).toContainEqual(expect.objectContaining({
          needDonorCode: 'ND-91CE-44', validity: expectedValidity, response: 'sin_respuesta',
        }));
        expect(responses.body.data.confirmedIntentCount).toBe(2);
        expect(responses.body.data.items).toContainEqual(expect.objectContaining({ response: 'confirmada', donorName: 'Donante Demo' }));
        expect(needDetail.body.data.status).toBe(status === 'activa' ? 'vencida' : status);
        expect(needs.body.data.items.some((item: { needId: string }) => item.needId === needId)).toBe(expectedValidity === 'vencida');
        expect(state).toEqual(before);
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it.each(['cerrada', 'cancelada', 'vencida', 'expired-active'] as const)(
    'replays 201 after %s while a new intent conflicts and creates no batch', async (terminal) => {
      const state = createDemoState();
      const app = createApp(state);
      const cookie = await login(app, 'hospital.demo@example.test');
      const csrf = await csrfToken(app, cookie);
      const post = (key: string) => request(app).post(batchPath).set('Cookie', cookie)
        .set('Origin', appOrigin).set('X-CSRF-Token', csrf).set('Idempotency-Key', key);
      const created = await post('synthetic-terminal-replay-0001');
      expect(created.status).toBe(201);
      expect(created.body.data).toEqual({ batchId: expect.any(String), createdInvitationCount: 0, queuedEmailCount: 0 });
      if (terminal === 'expired-active') state.needs[0]!.expiresAt = new Date(Date.now() - 1).toISOString();
      else state.needs[0]!.status = terminal;
      const batchesBefore = structuredClone(state.invitationBatches);
      const invitationsBefore = structuredClone(state.invitations);

      const replay = await post('synthetic-terminal-replay-0001');
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(created.body);
      const newIntent = await post('synthetic-terminal-new-intent-0002');
      expect(newIntent.status).toBe(409);
      expect(newIntent.body.error.code).toBe('STATE_CONFLICT');
      expect(state.invitationBatches).toEqual(batchesBefore);
      expect(state.invitations).toEqual(invitationsBefore);
      expect(state.idempotency.size).toBe(1);
    },
  );

  it('checks authentication, role, ownership, Origin, CSRF and key before terminal replay', async () => {
    const state = createDemoState();
    const app = createApp(state);
    const cookie = await login(app, 'hospital.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const key = 'synthetic-protected-replay-0001';
    expect((await request(app).post(batchPath).set('Cookie', cookie).set('Origin', appOrigin)
      .set('X-CSRF-Token', csrf).set('Idempotency-Key', key)).status).toBe(201);
    state.needs[0]!.status = 'cerrada';
    const foreignCookie = await login(app, 'hospital.norte.demo@example.test');
    const foreignCsrf = await csrfToken(app, foreignCookie);
    const donorCookie = await login(app, 'donante.demo@example.test');
    const before = structuredClone(state);
    const cases = [
      { cookie: '', csrf, origin: appOrigin, key, status: 401 },
      { cookie: donorCookie, csrf, origin: appOrigin, key, status: 403 },
      { cookie: foreignCookie, csrf: foreignCsrf, origin: appOrigin, key, status: 404 },
      { cookie, csrf, origin: 'https://attacker.example', key, status: 403 },
      { cookie, csrf: '', origin: appOrigin, key, status: 403 },
      { cookie, csrf, origin: appOrigin, key: 'short', status: 400 },
    ];
    for (const testCase of cases) {
      const result = await request(app).post(batchPath).set('Cookie', testCase.cookie)
        .set('Origin', testCase.origin).set('X-CSRF-Token', testCase.csrf).set('Idempotency-Key', testCase.key);
      expect(result.status).toBe(testCase.status);
      expect(result.body.error).toMatchObject({ correlationId: expect.any(String) });
      expect(state).toEqual(before);
    }
    // Even the original actor loses replay access after losing resource ownership.
    state.needs[0]!.hospitalId = state.needs[1]!.hospitalId;
    const hiddenReplay = await request(app).post(batchPath).set('Cookie', cookie).set('Origin', appOrigin)
      .set('X-CSRF-Token', csrf).set('Idempotency-Key', key);
    expect(hiddenReplay.status).toBe(404);
    expect(state.invitationBatches).toHaveLength(1);
  });

  it.each([
    { limit: undefined, count: 25, pages: 2 },
    { limit: 1, count: 25, pages: 25 },
    { limit: 100, count: 125, pages: 2 },
  ])('paginates $count batches with limit $limit, stable ties and no duplicates or skips', async ({ limit, count, pages: expectedPages }) => {
    const state = createDemoState();
    const expectedIds = seedBatches(state, state.needs[0]!, count);
    const app = createApp(state);
    const cookie = await login(app, 'hospital.demo@example.test');
    const before = structuredClone(state);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: { limit?: number; cursor?: string } = {};
      if (limit !== undefined) query.limit = limit;
      if (cursor !== null) query.cursor = cursor;
      const page = await request(app).get(batchPath).query(query).set('Cookie', cookie);
      expect(page.status).toBe(200);
      const ids = page.body.data.items.map((item: { batchId: string }) => item.batchId);
      expect(ids).toHaveLength(Math.min(limit ?? 20, count - seen.length));
      seen.push(...ids);
      cursor = page.body.data.pagination.nextCursor;
      if (cursor !== null) expect(cursor).toEqual(expect.any(String));
      pages += 1;
      expect(pages).toBeLessThanOrEqual(count);
    } while (cursor !== null);
    expect(pages).toBe(expectedPages);
    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(count);
    expect(state).toEqual(before);
  });

  it('binds cursors to hospital and need, rejects malformed queries safely and honors bounds', async () => {
    const state = createDemoState();
    seedBatches(state, state.needs[0]!, 3);
    seedBatches(state, state.needs[1]!, 3);
    const anotherOwnNeed = { ...state.needs[0]!, needId: '91e1a960-d3be-4d93-b291-6b223f0c2b6d' };
    state.needs.push(anotherOwnNeed);
    seedBatches(state, anotherOwnNeed, 3);
    const app = createApp(state);
    const primary = await login(app, 'hospital.demo@example.test');
    const alternate = await login(app, 'hospital.norte.demo@example.test');
    const first = await request(app).get(batchPath).query({ limit: 1 }).set('Cookie', primary);
    expect(first.status).toBe(200);
    const cursor = first.body.data.pagination.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    const before = structuredClone(state);
    for (const [id, cookie] of [[foreignNeedId, alternate], [anotherOwnNeed.needId, primary]]) {
      const foreignCursor = await request(app).get(`/api/v1/hospitals/me/needs/${id}/invitation-batches`)
        .query({ cursor }).set('Cookie', cookie!);
      expect(foreignCursor.status).toBe(400);
      expect(foreignCursor.body.error.code).toBe('BAD_REQUEST');
    }
    const hidden = await request(app).get(batchPath).query({ cursor: 'malformed' }).set('Cookie', alternate);
    expect(hidden.status).toBe(404);
    for (const query of [
      { cursor: '' }, { cursor: 'malformed' }, { cursor: 'a'.repeat(43) }, { cursor: 'a'.repeat(513) },
      { cursor: ['one', 'two'] }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: 'NaN' },
      { limit: [1, 2] }, { hospitalId: 'forged' },
    ]) {
      const invalid = await request(app).get(batchPath).query(query).set('Cookie', primary);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Solicitud malformada.', correlationId: expect.any(String) });
    }
    const maxPage = await request(app).get(batchPath).query({ limit: 100 }).set('Cookie', primary);
    expect(maxPage.status).toBe(200);
    expect(maxPage.body.data.items).toHaveLength(3);
    expect(maxPage.body.data.pagination.nextCursor).toBeNull();
    expect(state).toEqual(before);
  });

  it('keeps the cursor anchor stable across inserts and changing page size', async () => {
    const state = createDemoState();
    const expectedIds = seedBatches(state, state.needs[0]!, 3);
    const app = createApp(state);
    const cookie = await login(app, 'hospital.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const first = await request(app).get(batchPath).query({ limit: 1 }).set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.items[0].batchId).toBe(expectedIds[0]);
    const cursor = first.body.data.pagination.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    // This row sorts before the anchor: offset pagination would duplicate it.
    state.invitationBatches.push({ ...state.invitationBatches[0]!,
      batchId: '71e1a960-d3be-4d93-b291-6b223f0c2b6d', createdAt: '2026-09-01T00:00:00.000Z',
    });
    const created = await request(app).post(batchPath).set('Cookie', cookie)
      .set('Origin', appOrigin).set('X-CSRF-Token', csrf).set('Idempotency-Key', 'synthetic-page-new-batch-0001');
    expect(created.status).toBe(201);
    const before = structuredClone(state);
    const query = { cursor, limit: 100 };
    const next = await request(app).get(batchPath).query(query).set('Cookie', cookie);
    expect(next.status).toBe(200);
    expect(next.body.data.items.map((item: { batchId: string }) => item.batchId))
      .toEqual([...expectedIds.slice(1), created.body.data.batchId]);
    expect(next.body.data.pagination.nextCursor).toBeNull();
    const replay = await request(app).get(batchPath).query(query).set('Cookie', cookie);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(next.body);
    expect(state).toEqual(before);
  });
});

describe('T4a batch boundary, exact DTO and local retry regressions (not DB/outbox proof)', () => {
  const needId = '4c117ef2-3ebd-43f2-8629-c06d5c8df68f';
  const batchPath = `/api/v1/hospitals/me/needs/${needId}/invitation-batches`;
  const expiry = Date.parse('2026-10-03T12:00:00.000Z');

  it.each([
    { offset: -1, expectedStatus: 201 },
    { offset: 0, expectedStatus: 409 },
    { offset: 1, expectedStatus: 409 },
  ])('new POST at expiry $offset ms returns $expectedStatus without invitations or email', async ({ offset, expectedStatus }) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expiry - 1000);
    try {
      const state = createDemoState();
      state.needs[0]!.expiresAt = new Date(expiry).toISOString();
      const app = createApp(state);
      const cookie = await login(app, 'hospital.demo@example.test');
      const csrf = await csrfToken(app, cookie);
      const before = structuredClone(state);
      clock.mockReturnValue(expiry + offset);
      const result = await request(app).post(batchPath).set('Cookie', cookie)
        .set('Origin', appOrigin).set('X-CSRF-Token', csrf).set('Idempotency-Key', 'synthetic-expiry-batch-0001');
      expect(result.status).toBe(expectedStatus);
      expect(state.invitations).toEqual(before.invitations);
      expect(state.responseHistory).toEqual(before.responseHistory);
      expect(state.needs).toEqual(before.needs);
      if (expectedStatus === 409) {
        expect(result.body).toEqual({ error: {
          code: 'STATE_CONFLICT', message: 'La operación entra en conflicto con el estado actual.', correlationId: expect.any(String),
        } });
        expect(state).toEqual(before);
        return;
      }
      expect(result.body).toEqual({ data: { batchId: expect.any(String), createdInvitationCount: 0, queuedEmailCount: 0 } });
      expect(state.invitationBatches).toHaveLength(1);
      const listed = await request(app).get(batchPath).set('Cookie', cookie);
      expect(listed.status).toBe(200);
      // Exact DTO allowlist; no hospitalId/needId or donor/provider internals.
      expect(listed.body).toEqual({ data: { items: [{
        batchId: result.body.data.batchId, createdAt: expect.any(String), createdInvitationCount: 0,
        deliveryCounts: { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 },
      }], pagination: { nextCursor: null } } });
    } finally { vi.restoreAllMocks(); }
  });

  it('replays before/exact/after expiry but refuses every new terminal intent with no extra side effects', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expiry - 1);
    try {
      const state = createDemoState();
      state.needs[0]!.expiresAt = new Date(expiry).toISOString();
      const app = createApp(state);
      const cookie = await login(app, 'hospital.demo@example.test');
      const csrf = await csrfToken(app, cookie);
      const post = (key: string) => request(app).post(batchPath).set('Cookie', cookie)
        .set('Origin', appOrigin).set('X-CSRF-Token', csrf).set('Idempotency-Key', key);
      const created = await post('synthetic-boundary-replay-0001');
      expect(created.status).toBe(201);
      const before = structuredClone(state);
      for (const offset of [-1, 0, 1]) {
        clock.mockReturnValue(expiry + offset);
        const replay = await post('synthetic-boundary-replay-0001');
        expect(replay.status).toBe(201);
        expect(replay.body).toEqual(created.body);
        if (offset >= 0) {
          const fresh = await post(`synthetic-boundary-fresh-${offset.toString().padStart(4, '0')}`);
          expect(fresh.status).toBe(409);
        }
        expect(state).toEqual(before);
      }
    } finally { vi.restoreAllMocks(); }
  });

  it('twenty concurrent local retries yield one batch and a different hospital cannot replay its DTO', async () => {
    const state = createDemoState();
    const app = createApp(state);
    const cookie = await login(app, 'hospital.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const foreignCookie = await login(app, 'hospital.norte.demo@example.test');
    const foreignCsrf = await csrfToken(app, foreignCookie);
    const invitations = structuredClone(state.invitations);
    const key = 'synthetic-concurrent-batch-0001';
    const retry = () => request(app).post(batchPath).set('Cookie', cookie)
      .set('Origin', appOrigin).set('X-CSRF-Token', csrf).set('Idempotency-Key', key);
    const replies = await Promise.all(Array.from({ length: 20 }, retry));
    expect(replies.map((reply) => reply.status)).toEqual(Array(20).fill(201));
    for (const reply of replies) expect(reply.body).toEqual(replies[0]!.body);
    expect(state.invitationBatches).toHaveLength(1);
    expect(state.invitations).toEqual(invitations);
    expect(replies[0]!.body.data).toEqual({ batchId: expect.any(String), createdInvitationCount: 0, queuedEmailCount: 0 });
    const before = structuredClone(state);
    const hidden = await request(app).post(batchPath).set('Cookie', foreignCookie)
      .set('Origin', appOrigin).set('X-CSRF-Token', foreignCsrf).set('Idempotency-Key', key);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: {
      code: 'RESOURCE_NOT_FOUND', message: 'El recurso no está disponible.', correlationId: expect.any(String),
    } });
    expect(state).toEqual(before);
  });
});

describe('mock API demo slice', () => {
  it('refuses to construct the local mock in production mode', () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => createApp()).toThrow('El mock local no puede ejecutarse en producción.');
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });

  it('serves liveness without requiring a session', async () => {
    const response = await request(createApp()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
  });

  it('creates an HttpOnly session and returns only the authenticated actor', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/v1/auth/sessions')
      .set('Idempotency-Key', 'synthetic-login-key-explicit-01')
      .send({ email: 'donante.demo@example.test', password: demoPassword });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      actor: { role: 'donante', displayName: 'Donante Demo' },
      aal: 1,
      mfaRequired: false,
    });
    expect(Date.parse(response.body.data.expiresAt)).toBeGreaterThan(Date.now());
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('Secure');
    expect(JSON.stringify(response.body)).not.toContain(demoPassword);
  });

  it('replays login for the same idempotency key and rejects changed login input', async () => {
    const app = createApp();
    const createSession = (email: string) => request(app)
      .post('/api/v1/auth/sessions')
      .set('Idempotency-Key', 'synthetic-login-replay-key-001')
      .send({ email, password: demoPassword });

    const first = await createSession('donante.demo@example.test');
    const replay = await createSession('donante.demo@example.test');
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers['set-cookie'][0].split(';', 1)[0])
      .toBe(first.headers['set-cookie'][0].split(';', 1)[0]);

    const conflict = await createSession('hospital.demo@example.test');
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects unauthenticated profile access with a safe error envelope', async () => {
    const response = await request(createApp()).get('/api/v1/donors/me/profile');

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('expires server-side sessions at the cookie lifetime boundary', async () => {
    const app = createApp();
    const cookie = await login(app, 'donante.demo@example.test');
    const originalNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(originalNow + 30 * 60 * 1000 + 1);
    try {
      const response = await request(app)
        .get('/api/v1/auth/session')
        .set('Cookie', cookie);
      expect(response.status).toBe(401);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('invalidates the session on authenticated logout', async () => {
    const app = createApp();
    const cookie = await login(app, 'donante.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const logoutSession = () => request(app)
      .delete('/api/v1/auth/sessions/current')
      .set('Cookie', cookie)
      .set('Origin', appOrigin)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'test-logout-session-0001');
    const logout = await logoutSession();

    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(logout.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await logoutSession()).status).toBe(204);
    expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
  });

  it('requires a same-origin reset capability and revokes sessions when reset', async () => {
    const previousToken = process.env.MOCK_RESET_TOKEN;
    process.env.MOCK_RESET_TOKEN = 'synthetic-reset-test-capability-0123456789';
    try {
      const app = createApp();
      const cookie = await login(app, 'donante.demo@example.test');
      const denied = await request(app)
        .post('/__mock/reset')
        .set('Origin', 'https://attacker.example')
        .set('X-Mock-Reset-Token', process.env.MOCK_RESET_TOKEN!);
      expect(denied.status).toBe(403);
      expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(200);

      const reset = await request(app)
        .post('/__mock/reset')
        .set('Origin', appOrigin)
        .set('X-Mock-Reset-Token', process.env.MOCK_RESET_TOKEN!);
      expect(reset.status).toBe(204);
      expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie)).status).toBe(401);
    } finally {
      if (previousToken === undefined) delete process.env.MOCK_RESET_TOKEN;
      else process.env.MOCK_RESET_TOKEN = previousToken;
    }
  });

  it('returns a donor allowlist without donation history or another actor’s data', async () => {
    const app = createApp();
    const cookie = await login(app, 'donante.demo@example.test');
    const response = await request(app)
      .get('/api/v1/donors/me/profile')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      name: 'Donante Demo',
      email: 'donante.demo@example.test',
      declaredBloodType: 'O_POS',
      isAvailable: true,
      approximateLocation: { latitude: -12.046, longitude: -77.043 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/lastDonation|donationHistory|hospitalId/i);

    const forbidden = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', cookie);
    expect(forbidden.status).toBe(403);
  });

  it('does not allow one donor to read or change another donor’s invitation', async () => {
    const app = createApp();
    const alternateCookie = await login(app, 'alterno.demo@example.test');
    const csrf = await csrfToken(app, alternateCookie);
    const invitationId = '76eb9a7c-484f-4478-9a6f-01a21710ce8f';

    const hidden = await request(app)
      .get(`/api/v1/donors/me/invitations/${invitationId}`)
      .set('Cookie', alternateCookie);
    expect(hidden.status).toBe(404);

    const change = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', alternateCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-foreign-response-0001')
      .send({ response: 'rechazada' });
    expect(change.status).toBe(404);
  });


  it('scopes hospital needs to the authenticated hospital and hides donor details', async () => {
    const app = createApp();
    const cookie = await login(app, 'hospital.demo@example.test');
    const response = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      component: 'RBC',
      requiredBloodType: 'O_POS',
      confirmedIntentCount: 2,
      status: 'activa',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/donorName|declaredBloodType|email|latitude|longitude/i);

    const injectedHospital = await request(app)
      .get('/api/v1/hospitals/me/needs?hospitalId=other-hospital')
      .set('Cookie', cookie);
    expect(injectedHospital.status).toBe(422);
  });

  it('requires session-bound CSRF and an allowed origin for donor response changes', async () => {
    const app = createApp();
    const cookie = await login(app, 'donante.demo@example.test');
    const csrf = await csrfToken(app, cookie);

    const missingCsrf = await request(app)
      .patch('/api/v1/donors/me/invitations/76eb9a7c-484f-4478-9a6f-01a21710ce8f/response')
      .set('Cookie', cookie)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-response-key-0001')
      .send({ response: 'rechazada' });
    expect(missingCsrf.status).toBe(403);

    const wrongOrigin = await request(app)
      .patch('/api/v1/donors/me/invitations/76eb9a7c-484f-4478-9a6f-01a21710ce8f/response')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', 'https://unexpected.example')
      .set('Idempotency-Key', 'test-response-key-0002')
      .send({ response: 'rechazada' });
    expect(wrongOrigin.status).toBe(403);

    const missingOrigin = await request(app)
      .patch('/api/v1/donors/me/invitations/76eb9a7c-484f-4478-9a6f-01a21710ce8f/response')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'test-response-no-origin-01')
      .send({ response: 'rechazada' });
    expect(missingOrigin.status).toBe(403);
  });

  it('hides donor identity from the hospital after a confirmed response is withdrawn', async () => {
    const app = createApp();
    const donorCookie = await login(app, 'donante.demo@example.test');
    const hospitalCookie = await login(app, 'hospital.demo@example.test');
    const csrf = await csrfToken(app, donorCookie);
    const invitationId = '76eb9a7c-484f-4478-9a6f-01a21710ce8f';
    const needId = '4c117ef2-3ebd-43f2-8629-c06d5c8df68f';

    const initial = await request(app)
      .get(`/api/v1/hospitals/me/needs/${needId}/responses`)
      .set('Cookie', hospitalCookie);
    expect(initial.status).toBe(200);
    expect(initial.body.data.items).toContainEqual(expect.objectContaining({
      donorName: 'Donante Demo',
      declaredBloodType: 'O_POS',
      response: 'confirmada',
    }));

    const changed = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-response-change-0001')
      .send({ response: 'rechazada' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.response).toBe('rechazada');

    const replay = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-response-change-0001')
      .send({ response: 'rechazada' });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(changed.body);

    const keyConflict = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-response-change-0001')
      .send({ response: 'confirmada' });
    expect(keyConflict.status).toBe(409);

    const after = await request(app)
      .get(`/api/v1/hospitals/me/needs/${needId}/responses`)
      .set('Cookie', hospitalCookie);
    expect(after.status).toBe(200);
    expect(after.body.data.confirmedIntentCount).toBe(1);
    expect(after.body.data.items).toContainEqual(expect.objectContaining({
      needDonorCode: 'ND-4F8E-21',
      response: 'rechazada',
    }));
    expect(JSON.stringify(after.body)).not.toContain('Donante Demo');
    expect(JSON.stringify(after.body)).not.toContain('O_POS');
  });

  it('rejects unknown mutation fields rather than accepting mass assignment', async () => {
    const app = createApp();
    const cookie = await login(app, 'donante.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const response = await request(app)
      .patch('/api/v1/donors/me/profile')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-profile-update-0001')
      .send({ isAvailable: false, declaredBloodType: 'AB_POS' });

    expect(response.status).toBe(422);
  });

  it('restricts superadmin views to minimized administrative data', async () => {
    const app = createApp();
    const cookie = await login(app, 'superadmin.demo@example.test');
    const [tasks, hospitals, events, configuration] = await Promise.all([
      request(app).get('/api/v1/superadmin/task-queue').set('Cookie', cookie),
      request(app).get('/api/v1/superadmin/hospitals').set('Cookie', cookie),
      request(app).get('/api/v1/superadmin/audit-events').set('Cookie', cookie),
      request(app).get('/api/v1/superadmin/configuration').set('Cookie', cookie),
    ]);

    expect(tasks.status).toBe(200);
    expect(tasks.body.data.items[0]).toMatchObject({
      kind: 'correction_request',
      resourceCode: 'request-51a8f2',
    });
    expect(JSON.stringify(tasks.body)).not.toMatch(/email|donorName|declaredBloodType/i);
    expect(hospitals.status).toBe(200);
    expect(hospitals.body.data.items[0].publicName).toBe('Hospital Demo');
    expect(events.status).toBe(200);
    expect(JSON.stringify(events.body)).not.toMatch(/email|donorName|declaredBloodType/i);
    expect(configuration.body.data).toEqual({ finalDemoAt: null, isImmutable: false });

    const donorCookie = await login(app, 'donante.demo@example.test');
    const denied = await request(app)
      .get('/api/v1/superadmin/hospitals')
      .set('Cookie', donorCookie);
    expect(denied.status).toBe(403);
  });

  it('creates hospital needs as drafts and replays idempotent requests', async () => {
    const app = createApp();
    const cookie = await login(app, 'hospital.demo@example.test');
    const csrf = await csrfToken(app, cookie);
    const payload = {
      component: 'RBC',
      requiredBloodType: 'A_POS',
      targetConfirmations: 3,
      siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
      radiusKm: 8,
      urgency: 'Normal',
      expiresInHours: 12,
    };
    const createNeed = () => request(app)
      .post('/api/v1/hospitals/me/needs')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-create-need-0001')
      .send(payload);

    const created = await createNeed();
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      component: 'RBC',
      requiredBloodType: 'A_POS',
      targetConfirmations: 3,
      confirmedIntentCount: 0,
      status: 'borrador',
    });

    const replay = await createNeed();
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(created.body);

    const conflict = await request(app)
      .post('/api/v1/hospitals/me/needs')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-create-need-0001')
      .send({ ...payload, targetConfirmations: 4 });
    expect(conflict.status).toBe(409);
  });

  it('expires pending invitations with their need and refuses later responses', async () => {
    const state = createDemoState();
    state.needs[0]!.expiresAt = new Date(Date.now() - 1).toISOString();
    const app = createApp(state);
    const donorCookie = await login(app, 'pendiente.demo@example.test');
    const donorCsrf = await csrfToken(app, donorCookie);
    const invitationId = '8db9b15d-2d84-4c42-97bb-2214571f8301';

    const invitations = await request(app)
      .get('/api/v1/donors/me/invitations')
      .set('Cookie', donorCookie);
    expect(invitations.body.data.items[0]).toMatchObject({
      invitationId,
      validity: 'vencida',
      response: 'sin_respuesta',
    });

    const lateResponse = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', donorCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-expired-need-response-01')
      .send({ response: 'confirmada' });
    expect(lateResponse.status).toBe(409);

    const hospitalCookie = await login(app, 'hospital.demo@example.test');
    const needs = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', hospitalCookie);
    expect(needs.body.data.items[0].status).toBe('vencida');
  });

  it('isolates two hospital memberships and assigns new needs from the actor session', async () => {
    const app = createApp();
    const primaryCookie = await login(app, 'hospital.demo@example.test');
    const alternateCookie = await login(app, 'hospital.norte.demo@example.test');
    const primaryNeedId = '4c117ef2-3ebd-43f2-8629-c06d5c8df68f';
    const alternateNeedId = 'd3ed0c32-264b-4b25-858c-3f8aa1b6678f';

    const primaryNeeds = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', primaryCookie);
    const alternateNeeds = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', alternateCookie);
    expect(primaryNeeds.body.data.items.map((need: { needId: string }) => need.needId)).toEqual([primaryNeedId]);
    expect(alternateNeeds.body.data.items.map((need: { needId: string }) => need.needId)).toEqual([alternateNeedId]);

    const hiddenNeed = await request(app)
      .get(`/api/v1/hospitals/me/needs/${alternateNeedId}`)
      .set('Cookie', primaryCookie);
    expect(hiddenNeed.status).toBe(404);

    const alternateCsrf = await csrfToken(app, alternateCookie);
    const crossTenantSite = await request(app)
      .post('/api/v1/hospitals/me/needs')
      .set('Cookie', alternateCookie)
      .set('X-CSRF-Token', alternateCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-other-hospital-site-0001')
      .send({
        component: 'RBC',
        requiredBloodType: 'A_POS',
        targetConfirmations: 2,
        siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
        radiusKm: 8,
        urgency: 'Normal',
        expiresInHours: 12,
      });
    expect(crossTenantSite.status).toBe(422);

    const validNeed = await request(app)
      .post('/api/v1/hospitals/me/needs')
      .set('Cookie', alternateCookie)
      .set('X-CSRF-Token', alternateCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-other-hospital-site-0002')
      .send({
        component: 'RBC',
        requiredBloodType: 'A_POS',
        targetConfirmations: 2,
        siteId: '7c6b5a49-3827-4615-9d0e-123456789abc',
        radiusKm: 8,
        urgency: 'Normal',
        expiresInHours: 12,
      });
    expect(validNeed.status).toBe(201);
    const alternateNeedsAfterCreate = await request(app)
      .get('/api/v1/hospitals/me/needs')
      .set('Cookie', alternateCookie);
    expect(alternateNeedsAfterCreate.body.data.items).toHaveLength(2);
    expect(alternateNeedsAfterCreate.body.data.items.map((need: { needId: string }) => need.needId))
      .not.toContain(primaryNeedId);
  });

  it('returns only the authenticated donor’s immutable response history', async () => {
    const app = createApp();
    const donorCookie = await login(app, 'donante.demo@example.test');
    const csrf = await csrfToken(app, donorCookie);
    const invitationId = '76eb9a7c-484f-4478-9a6f-01a21710ce8f';

    const changed = await request(app)
      .patch(`/api/v1/donors/me/invitations/${invitationId}/response`)
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-history-response-0001')
      .send({ response: 'rechazada' });
    expect(changed.status).toBe(200);

    const history = await request(app)
      .get('/api/v1/donors/me/responses')
      .set('Cookie', donorCookie);
    expect(history.status).toBe(200);
    expect(history.body.data.items).toHaveLength(2);
    expect(history.body.data.items.map((item: { response: string }) => item.response))
      .toEqual(['rechazada', 'confirmada']);
    expect(JSON.stringify(history.body)).not.toMatch(/email|donorId|hospitalId|approximateLocation/i);

    const otherDonorCookie = await login(app, 'alterno.demo@example.test');
    const otherHistory = await request(app)
      .get('/api/v1/donors/me/responses')
      .set('Cookie', otherDonorCookie);
    expect(otherHistory.status).toBe(200);
    expect(otherHistory.body.data.items).toHaveLength(1);
    expect(otherHistory.body.data.items[0].invitationId).not.toBe(invitationId);

    const attemptedHistoryMutation = await request(app)
      .delete('/api/v1/donors/me/responses')
      .set('Cookie', donorCookie);
    expect(attemptedHistoryMutation.status).toBe(404);
    const unchangedHistory = await request(app)
      .get('/api/v1/donors/me/responses')
      .set('Cookie', donorCookie);
    expect(unchangedHistory.body.data.items).toHaveLength(2);
  });

  it('stores only field labels for own correction/deletion requests', async () => {
    const state = createDemoState();
    const app = createApp(state);
    const donorCookie = await login(app, 'donante.demo@example.test');
    const csrf = await csrfToken(app, donorCookie);
    const proposedValues = {
      type: 'correccion',
      changes: {
        name: 'Nombre sintético actualizado',
        newEmail: 'cambio.demo@example.test',
      },
    };
    const createRequest = () => request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-own-correction-0001')
      .send(proposedValues);

    const created = await createRequest();
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      type: 'correccion',
      requestedFields: ['name', 'email'],
      status: 'pendiente',
    });
    expect(JSON.stringify(created.body)).not.toContain('Nombre sintético actualizado');
    expect(JSON.stringify(created.body)).not.toContain('cambio.demo@example.test');
    expect(state.correctionRequests).toHaveLength(1);
    expect(JSON.stringify(state.correctionRequests)).not.toContain('Nombre sintético actualizado');
    expect(JSON.stringify(state.correctionRequests)).not.toContain('cambio.demo@example.test');

    const realName = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-real-name-rejected-01')
      .send({ type: 'correccion', changes: { name: 'Nombre de persona' } });
    expect(realName.status).toBe(422);

    const prefixedRealName = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-prefixed-name-rejected-01')
      .send({ type: 'correccion', changes: { name: 'Nombre sintético Persona Real' } });
    expect(prefixedRealName.status).toBe(422);

    const nonSyntheticEmail = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-real-email-rejected-01')
      .send({ type: 'correccion', changes: { newEmail: 'person@example.org' } });
    expect(nonSyntheticEmail.status).toBe(422);
    const otherSyntheticEmail = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-other-email-rejected-01')
      .send({ type: 'correccion', changes: { newEmail: 'persona@example.test' } });
    expect(otherSyntheticEmail.status).toBe(422);

    const otherBloodType = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-other-bloodtype-rejected-01')
      .send({ type: 'correccion', changes: { declaredBloodType: 'B_POS' } });
    expect(otherBloodType.status).toBe(422);
    expect(state.correctionRequests).toHaveLength(1);

    const replay = await createRequest();
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(created.body);
    expect(state.correctionRequests).toHaveLength(1);

    const list = await request(app)
      .get('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie);
    expect(list.body.data.items).toHaveLength(1);

    const otherDonorCookie = await login(app, 'alterno.demo@example.test');
    const otherRequests = await request(app)
      .get('/api/v1/donors/me/correction-requests')
      .set('Cookie', otherDonorCookie);
    expect(otherRequests.status).toBe(200);
    expect(otherRequests.body.data.items).toHaveLength(0);

    const foreignDetail = await request(app)
      .get(`/api/v1/donors/me/correction-requests/${created.body.data.requestId}`)
      .set('Cookie', otherDonorCookie);
    expect(foreignDetail.status).toBe(404);

    const conflict = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-own-correction-0001')
      .send({ type: 'eliminacion' });
    expect(conflict.status).toBe(409);

    const deletion = await request(app)
      .post('/api/v1/donors/me/correction-requests')
      .set('Cookie', donorCookie)
      .set('X-CSRF-Token', csrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-own-deletion-0001')
      .send({ type: 'eliminacion' });
    expect(deletion.status).toBe(201);
    expect(deletion.body.data).toMatchObject({ type: 'eliminacion', requestedFields: ['deletion'] });
    expect(state.correctionRequests).toHaveLength(2);
  });

  it('records a manual invitation-batch request only for an own active need', async () => {
    const app = createApp();
    const primaryCookie = await login(app, 'hospital.demo@example.test');
    const alternateCookie = await login(app, 'hospital.norte.demo@example.test');
    const primaryCsrf = await csrfToken(app, primaryCookie);
    const alternateCsrf = await csrfToken(app, alternateCookie);
    const needId = '4c117ef2-3ebd-43f2-8629-c06d5c8df68f';
    const path = `/api/v1/hospitals/me/needs/${needId}/invitation-batches`;
    const requestBatch = () => request(app)
      .post(path)
      .set('Cookie', primaryCookie)
      .set('X-CSRF-Token', primaryCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-manual-batch-0001');

    const created = await requestBatch();
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ createdInvitationCount: 0, queuedEmailCount: 0 });
    expect((await requestBatch()).body).toEqual(created.body);

    const ownBatches = await request(app).get(path).set('Cookie', primaryCookie);
    expect(ownBatches.status).toBe(200);
    expect(ownBatches.body.data.items).toHaveLength(1);
    expect(ownBatches.body.data.items[0].batchId).toBe(created.body.data.batchId);
    expect(JSON.stringify(ownBatches.body)).not.toMatch(/email|donorName|declaredBloodType/i);

    const foreignList = await request(app).get(path).set('Cookie', alternateCookie);
    const foreignCreate = await request(app)
      .post(path)
      .set('Cookie', alternateCookie)
      .set('X-CSRF-Token', alternateCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-foreign-batch-0001');
    expect(foreignList.status).toBe(404);
    expect(foreignCreate.status).toBe(404);

    const closedState = createDemoState();
    closedState.needs[0]!.status = 'cerrada';
    const closedApp = createApp(closedState);
    const closedHospital = await login(closedApp, 'hospital.demo@example.test');
    const closedCsrf = await csrfToken(closedApp, closedHospital);
    const closedBatch = await request(closedApp)
      .post(path)
      .set('Cookie', closedHospital)
      .set('X-CSRF-Token', closedCsrf)
      .set('Origin', appOrigin)
      .set('Idempotency-Key', 'test-closed-batch-0001');
    expect(closedBatch.status).toBe(409);
  });
});
