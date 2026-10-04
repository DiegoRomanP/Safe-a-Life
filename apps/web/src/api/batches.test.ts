import { afterEach, expect, it, vi } from 'vitest';
import { api } from './client.js';

afterEach(() => vi.unstubAllGlobals());

it('preserves batch pagination and encodes contractual cursor/limit parameters', async () => {
  const data = { items: [], pagination: { nextCursor: 'opaque+/=?' } };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ data }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  expect(await api.getHospitalInvitationBatches('need/id', { cursor: 'opaque+/=?', limit: 20 })).toEqual(data);
  const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
  expect(url.pathname).toBe('/api/v1/hospitals/me/needs/need%2Fid/invitation-batches');
  expect(url.searchParams.get('cursor')).toBe('opaque+/=?');
  expect(url.searchParams.get('limit')).toBe('20');
});

it('omits pagination parameters for the first default page', async () => {
  const data = { items: [], pagination: { nextCursor: null } };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await api.getHospitalInvitationBatches('need-first')).toEqual(data);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/hospitals/me/needs/need-first/invitation-batches', expect.anything());
});

it('propagates a failed batch GET without retrying or mutating', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }), { status: 500 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(api.getHospitalInvitationBatches('need-error')).rejects.toMatchObject({ status: 500 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: 'same-origin' }));
});

it('creates a fresh key only for a second explicit successful batch intent', async () => {
  const keys: Array<string | null> = [];
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input).endsWith('/auth/sessions')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    if (String(input).endsWith('/auth/csrf-token')) return new Response(JSON.stringify({ data: { token: 'synthetic-csrf-placeholder-for-batch-tests' } }), { status: 200 });
    if (init.method === 'POST') {
      keys.push(new Headers(init.headers).get('Idempotency-Key'));
      expect(init.body === undefined).toBe(true);
      return new Response(JSON.stringify({ data: { batchId: `synthetic-batch-${keys.length}`, createdInvitationCount: 0, queuedEmailCount: 0 } }), { status: 201 });
    }
    reads++;
    return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Error sintético.', correlationId: 'synthetic-read-error' } }), { status: 500 });
  }));
  await api.login('hospital.demo@example.test', 'synthetic-demo-only');
  await api.requestHospitalInvitationBatch('synthetic-need-new-intent');
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(api.getHospitalInvitationBatches('synthetic-need-new-intent')).rejects.toMatchObject({ status: 500 });
  }
  expect(keys.length).toBe(1);
  expect(reads).toBe(2);
  await api.requestHospitalInvitationBatch('synthetic-need-new-intent');
  expect(keys.length).toBe(2);
  expect(keys.every((key) => Boolean(key) && key!.length >= 16)).toBe(true);
  expect(keys[0] !== keys[1]).toBe(true); // Never print generated keys in failed assertions.
});

it('keeps an unknown-outcome key scoped to its need while another need completes an intent', async () => {
  const attempts: Array<{ need: string; key: string | null }> = [];
  let firstNeedAttempts = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    if (path.endsWith('/auth/sessions')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    if (path.endsWith('/auth/csrf-token')) return new Response(JSON.stringify({ data: { token: 'synthetic-csrf-placeholder-for-batch-tests' } }), { status: 200 });
    const need = path.split('/').at(-2)!;
    attempts.push({ need, key: new Headers(init.headers).get('Idempotency-Key') });
    if (need === 'synthetic-need-a' && ++firstNeedAttempts === 1) throw new TypeError('synthetic response lost');
    return new Response(JSON.stringify({ data: { batchId: `synthetic-batch-${attempts.length}`, createdInvitationCount: 0, queuedEmailCount: 0 } }), { status: 201 });
  }));
  await api.login('hospital.demo@example.test', 'synthetic-demo-only');
  await expect(api.requestHospitalInvitationBatch('synthetic-need-a')).rejects.toThrow('synthetic response lost');
  expect(attempts.length).toBe(1); // No automatic POST retry.
  await api.requestHospitalInvitationBatch('synthetic-need-b');
  await api.requestHospitalInvitationBatch('synthetic-need-a');
  await api.requestHospitalInvitationBatch('synthetic-need-a');
  expect(attempts.map((attempt) => attempt.need)).toEqual(['synthetic-need-a', 'synthetic-need-b', 'synthetic-need-a', 'synthetic-need-a']);
  expect(attempts.every((attempt) => Boolean(attempt.key))).toBe(true);
  expect(attempts[0]!.key === attempts[2]!.key).toBe(true);
  expect(new Set(attempts.map((attempt) => attempt.key)).size).toBe(3);
});

it('retries a failed page with the same scoped cursor without POST or idempotency headers', async () => {
  const calls: Array<{ cursor: string | null; isRead: boolean; hasKey: boolean }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ cursor: new URL(String(input), 'http://localhost').searchParams.get('cursor'),
      isRead: !init.method || init.method === 'GET', hasKey: new Headers(init.headers).has('Idempotency-Key') });
    if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }), { status: 500 });
    return new Response(JSON.stringify({ data: { items: [], pagination: { nextCursor: null } } }), { status: 200 });
  }));
  const query = { cursor: 'synthetic-failed-page+/=?', limit: 20 };
  await expect(api.getHospitalInvitationBatches('synthetic-need-page', query)).rejects.toMatchObject({ status: 500 });
  expect(calls.length).toBe(1);
  await api.getHospitalInvitationBatches('synthetic-need-page', query);
  expect(calls.length).toBe(2);
  expect(calls.every((call) => call.isRead && !call.hasKey && call.cursor === query.cursor)).toBe(true);
});
