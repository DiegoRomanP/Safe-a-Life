import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import { createInvitationsService } from './invitations-service.js';
import type { BatchSlot, InvitationsRepository, RetrySlot } from './invitations.ports.js';

const NEED = '40000000-0000-4000-8000-000000000001';
const INVITATION = '50000000-0000-4000-8000-000000000001';

function harness(options: { target?: number; allowed?: boolean } = {}) {
  const calls: string[] = [];
  const seen: { batch?: { grant: string; slots: readonly BatchSlot[]; envelope: { key: string; hash: string } }; retry?: { grant: string; slot: RetrySlot }; respond?: { tokenHash: string; hash: string } } = {};
  const sealed: Array<{ outboxId: string; payload: { token: string; rejectToken: string } }> = [];
  let counter = 0;
  const repository = {
    authorizeBatch: async () => { calls.push('authorizeBatch'); return { grantSecret: 'a'.repeat(64) }; },
    requestBatch: async (envelope, _needId, grant, slots) => {
      calls.push('requestBatch');
      seen.batch = { grant: grant.grantSecret, slots, envelope };
      return { batchId: 'b', createdInvitationCount: slots.length, queuedEmailCount: slots.length };
    },
    authorizeRetry: async () => { calls.push('authorizeRetry'); return { grantSecret: 'c'.repeat(64) }; },
    retryDelivery: async (_envelope, _id, grant, slot) => { calls.push('retryDelivery'); seen.retry = { grant: grant.grantSecret, slot }; },
    respondByToken: async (tokenHash, envelope) => { seen.respond = { tokenHash, hash: envelope.hash }; return { response: 'confirmada', recordedAt: 't', needStatus: 'activa' }; },
    previewAction: async (tokenHash) => { seen.respond = { tokenHash, hash: '' }; return { hospitalName: 'H', publicSiteName: 'S', intendedAction: 'confirmar', expiresAt: 't' }; },
  } as Partial<InvitationsRepository> as InvitationsRepository;
  const service = createInvitationsService({
    repository,
    needs: { get: async () => { calls.push('getNeed'); return { targetConfirmations: options.target ?? 3 } as never; } },
    limiter: { consume: async () => (options.allowed === false ? { allowed: false, retryAfterSeconds: 30 } : { allowed: true }) } as never,
    seal: (outboxId, payload) => { sealed.push({ outboxId, payload }); return `sellado-${outboxId}`; },
    newToken: () => `token-${(counter += 1)}-`.padEnd(32, 'x'),
    newId: () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`,
  });
  return { service, calls, seen, sealed };
}

describe('lote de invitaciones', () => {
  it.each([[1, 5], [2, 5], [3, 6], [25, 50], [50, 50]])('con meta %i prepara %i slots (batchSize)', async (target, slots) => {
    const { service, seen } = harness({ target });
    await service.requestBatch('jwt', 'clave-de-idempotencia-1', NEED);
    expect(seen.batch?.slots).toHaveLength(slots);
  });

  it('lee la necesidad, autoriza con la sesión de la persona y recién entonces ejecuta con la concesión', async () => {
    const { service, calls, seen } = harness();
    await service.requestBatch('jwt', 'clave-de-idempotencia-1', NEED);
    expect(calls).toEqual(['getNeed', 'authorizeBatch', 'requestBatch']);
    expect(seen.batch?.grant).toBe('a'.repeat(64));
    expect(seen.batch?.envelope).toEqual({ key: 'clave-de-idempotencia-1', hash: fingerprint([['needId', NEED]]) });
  });

  it('cada slot lleva ids y hashes distintos, y el payload sellado con dos tokens cuyo hash coincide', async () => {
    const { service, seen, sealed } = harness();
    await service.requestBatch('jwt', 'clave-de-idempotencia-1', NEED);
    const slots = seen.batch!.slots;
    expect(new Set(slots.map((slot) => slot.outboxId)).size).toBe(slots.length);
    expect(new Set(slots.map((slot) => slot.invitationId)).size).toBe(slots.length);
    expect(new Set(slots.flatMap((slot) => [slot.confirmHash, slot.rejectHash])).size).toBe(slots.length * 2);
    slots.forEach((slot, index) => {
      expect(slot.sealedPayload).toBe(`sellado-${slot.outboxId}`);
      expect(hashToken(sealed[index]!.payload.token)).toBe(slot.confirmHash);
      expect(hashToken(sealed[index]!.payload.rejectToken)).toBe(slot.rejectHash);
    });
  });

  it('los tokens en claro nunca llegan al repositorio', async () => {
    const { service, seen, sealed } = harness();
    await service.requestBatch('jwt', 'clave-de-idempotencia-1', NEED);
    const sent = JSON.stringify(seen.batch);
    for (const { payload } of sealed) {
      expect(sent).not.toContain(payload.token);
      expect(sent).not.toContain(payload.rejectToken);
    }
  });
});

describe('reintento manual', () => {
  it('autoriza con la sesión del superadmin y ejecuta con un slot nuevo', async () => {
    const { service, calls, seen, sealed } = harness();
    await service.retryDelivery('jwt', 'clave-de-idempotencia-2', INVITATION);
    expect(calls).toEqual(['authorizeRetry', 'retryDelivery']);
    expect(seen.retry?.grant).toBe('c'.repeat(64));
    expect(hashToken(sealed[0]!.payload.token)).toBe(seen.retry?.slot.confirmHash);
    expect(JSON.stringify(seen.retry)).not.toContain(sealed[0]!.payload.token);
  });
});

describe('respuesta por token', () => {
  it('consulta y responde por el hash del token, nunca por el token', async () => {
    const { service, seen } = harness();
    await service.previewAction('secreto-del-enlace', 'ip-hmac');
    expect(seen.respond?.tokenHash).toBe(hashToken('secreto-del-enlace'));
    await service.respondByToken('secreto-del-enlace', 'clave-de-idempotencia-3', 'ip-hmac');
    expect(seen.respond).toEqual({ tokenHash: hashToken('secreto-del-enlace'), hash: fingerprint([['tokenHash', hashToken('secreto-del-enlace')]]) });
  });

  it('el límite por IP responde 429 con Retry-After antes de tocar la base, también en la vista previa', async () => {
    const { service, seen } = harness({ allowed: false });
    await expect(service.previewAction('secreto-del-enlace', 'ip-hmac')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(service.respondByToken('secreto-del-enlace', 'clave-de-idempotencia-3', 'ip-hmac')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(service.respondByToken('secreto-del-enlace', 'clave-de-idempotencia-3', 'ip-hmac')).rejects.toBeInstanceOf(ApiError);
    expect(seen.respond).toBeUndefined();
  });
});
