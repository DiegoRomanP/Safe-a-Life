import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { OutboxKeyring } from '../../../shared/crypto/outbox-cipher.js';
import { FakeEmailSender } from '../infrastructure/fake-sender.js';
import { sealEmailPayload, type EmailPayload } from './email-payload.js';
import { createOutboxProcessor } from './process-outbox.js';
import type { AttemptRecord, ClaimedMessage, OutboxGateway } from './outbox.ports.js';

const KEYRING: OutboxKeyring = { currentKid: 'k1', keys: new Map([['k1', randomBytes(32)]]) };
const TOKEN = 'tok_canario_abcdefghijklmnop0123456789';
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

function message(overrides: Partial<ClaimedMessage> & { payload?: EmailPayload } = {}): ClaimedMessage {
  const outboxId = overrides.outboxId ?? '60000000-0000-4000-8000-000000000001';
  const payload: EmailPayload = overrides.payload ?? { recipient: 'donante@example.test', token: TOKEN };
  return {
    outboxId, kind: 'recuperacion', attemptNo: 1, idempotencyKey: `outbox-${outboxId}`, recipient: null, notAfter: new Date(NOW + 3_600_000).toISOString(),
    sealedPayload: sealEmailPayload(KEYRING, outboxId, payload), ...overrides,
  };
}

function harness(messages: ClaimedMessage[], options: { allowlist?: ReadonlySet<string> | null; sender?: FakeEmailSender; applied?: boolean; failRecord?: boolean } = {}) {
  const recorded: AttemptRecord[] = [];
  const gateway: OutboxGateway = {
    claim: async () => messages,
    recordAttempt: async (record) => {
      if (options.failRecord) throw new Error('canario-bd');
      recorded.push(record);
      return options.applied ?? true;
    },
    expire: async () => ({ expired: 0, exhausted: 0 }),
    ingestEvent: async () => ({ duplicate: false, matched: false }),
  };
  const sender = options.sender ?? new FakeEmailSender();
  const processor = createOutboxProcessor({
    gateway, sender, keyring: KEYRING, appPublicUrl: 'https://app.example.test',
    inboxAllowlist: options.allowlist === undefined ? null : options.allowlist, now: () => NOW, random: () => 0.5,
  });
  return { processor, recorded, sender };
}

describe('procesamiento del outbox', () => {
  it('envía, registra ok con el id del proveedor y resume el lote', async () => {
    const { processor, recorded, sender } = harness([message()]);

    const summary = await processor.runOnce();

    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0, retried: 0, skipped: 0 });
    expect(recorded).toEqual([{ outboxId: '60000000-0000-4000-8000-000000000001', attemptNo: 1, outcome: 'ok', httpStatus: 200, providerMessageId: 'fake-1', nextAttemptAt: null }]);
    expect(sender.records).toHaveLength(1);
  });

  it('usa el correo de auth.users cuando el outbox lo trae y no el del payload', async () => {
    let to = '';
    const sender = new FakeEmailSender((call, m) => ({ kind: 'ok', providerMessageId: `${call}-${m.idempotencyKey}` }));
    const original = sender.send.bind(sender);
    sender.send = async (m) => { to = m.to; return original(m); };
    const { processor } = harness([message({ recipient: 'cuenta@example.test', payload: { token: TOKEN } })], { sender });

    await processor.runOnce();

    expect(to).toBe('cuenta@example.test');
  });

  it('la clave de idempotencia del proveedor es la del outbox, igual en cada reintento', async () => {
    const keys: string[] = [];
    const sender = new FakeEmailSender((_call, m) => { keys.push(m.idempotencyKey); return { kind: 'transitorio', httpStatus: 503 }; });
    const first = harness([message({ attemptNo: 1 })], { sender });
    const second = harness([message({ attemptNo: 2 })], { sender });

    await first.processor.runOnce();
    await second.processor.runOnce();

    expect(keys).toEqual(['outbox-60000000-0000-4000-8000-000000000001', 'outbox-60000000-0000-4000-8000-000000000001']);
  });

  it('un resultado transitorio o incierto programa el siguiente intento con el retardo de la llamada', async () => {
    const sender = new FakeEmailSender(() => ({ kind: 'transitorio', httpStatus: 503 }));
    const { processor, recorded } = harness([message({ attemptNo: 2 })], { sender });

    const summary = await processor.runOnce();

    expect(summary.retried).toBe(1);
    expect(recorded[0].outcome).toBe('transitorio');
    expect(recorded[0].nextAttemptAt?.getTime()).toBe(NOW + 2 * 60_000);
  });

  it('tras la sexta llamada no se programa otro intento (nextAttemptAt nulo)', async () => {
    const sender = new FakeEmailSender(() => ({ kind: 'transitorio', httpStatus: 500 }));
    const { processor, recorded } = harness([message({ attemptNo: 6 })], { sender });

    await processor.runOnce();

    expect(recorded[0].nextAttemptAt).toBeNull();
  });

  it('un error permanente se registra como fallido', async () => {
    const sender = new FakeEmailSender(() => ({ kind: 'permanente', httpStatus: 422 }));
    const { processor, recorded } = harness([message()], { sender });

    expect((await processor.runOnce()).failed).toBe(1);
    expect(recorded[0]).toMatchObject({ outcome: 'permanente', httpStatus: 422, nextAttemptAt: null });
  });

  describe('allowlist de bandejas (RF-EML-04)', () => {
    it('un destinatario fuera de la lista se registra como permanente SIN llamar al proveedor', async () => {
      const { processor, recorded, sender } = harness([message()], { allowlist: new Set(['permitido@example.test']) });

      const summary = await processor.runOnce();

      expect(sender.records).toHaveLength(0);
      expect(recorded[0].outcome).toBe('permanente');
      expect(summary.failed).toBe(1);
    });

    it('un destinatario de la lista (sin distinguir mayúsculas) se envía', async () => {
      const { processor, sender } = harness([message({ payload: { recipient: 'Donante@Example.test', token: TOKEN } })], { allowlist: new Set(['donante@example.test']) });

      await processor.runOnce();

      expect(sender.records).toHaveLength(1);
    });

    it('una lista vacía no permite nada (falla cerrado) y null no restringe', async () => {
      const closed = harness([message()], { allowlist: new Set() });
      const open = harness([message()], { allowlist: null });

      await closed.processor.runOnce();
      await open.processor.runOnce();

      expect(closed.sender.records).toHaveLength(0);
      expect(open.sender.records).toHaveLength(1);
    });
  });

  describe('payload inválido', () => {
    it.each([
      ['de otro outbox (AAD distinto)', () => message({ sealedPayload: sealEmailPayload(KEYRING, '60000000-0000-4000-8000-0000000000ff', { recipient: 'd@example.test', token: TOKEN }) })],
      ['corrupto', () => message({ sealedPayload: 'v1.k1.x.y.z' })],
      ['sin destinatario en ninguna parte', () => message({ payload: { token: TOKEN } })],
      ['de una clave desconocida', () => message({ sealedPayload: 'v1.k9.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA' })],
      ['sin los datos que exige la plantilla', () => message({ kind: 'invitacion', payload: { recipient: 'd@example.test', token: TOKEN } })],
      ['con un token inválido para el enlace', () => message({ payload: { recipient: 'd@example.test', token: 'corto' } })],
    ])('%s se registra como permanente sin llamar al proveedor', async (_label, build) => {
      const { processor, recorded, sender } = harness([build()]);

      await processor.runOnce();

      expect(sender.records).toHaveLength(0);
      expect(recorded[0].outcome).toBe('permanente');
    });
  });

  it('el correo enviado lleva el enlace con el token en el fragmento y nunca en el asunto', async () => {
    let sent: { subject: string; text: string; html: string } | undefined;
    const sender = new FakeEmailSender();
    const original = sender.send.bind(sender);
    sender.send = async (m) => { sent = m; return original(m); };
    const { processor } = harness([message()], { sender });

    await processor.runOnce();

    expect(sent?.text).toContain(`https://app.example.test/restablecer-contrasena#${TOKEN}`);
    expect(sent?.subject).not.toContain(TOKEN);
  });

  it('nunca envía pasado not_after, aunque el reclamo fuera válido: no llama al proveedor ni registra el intento', async () => {
    const late = message({ notAfter: new Date(NOW - 1).toISOString() });
    const edge = message({ outboxId: '60000000-0000-4000-8000-000000000002', notAfter: new Date(NOW).toISOString() });
    const { processor, recorded, sender } = harness([late, edge]);

    const summary = await processor.runOnce();

    expect(sender.records).toHaveLength(0);
    expect(recorded).toHaveLength(0);
    expect(summary).toMatchObject({ claimed: 2, sent: 0, skipped: 2 });
  });

  it('un lote por defecto es de 5 mensajes (cabe en el lease de 120 s con 10 s por envío)', async () => {
    let requested = 0;
    const gateway = { claim: async (limit: number) => { requested = limit; return []; }, recordAttempt: async () => true, expire: async () => ({ expired: 0, exhausted: 0 }), ingestEvent: async () => ({ duplicate: false, matched: false }) };
    const processor = createOutboxProcessor({ gateway, sender: new FakeEmailSender(), keyring: KEYRING, appPublicUrl: 'https://app.example.test', inboxAllowlist: null });

    await processor.runOnce();

    expect(requested).toBe(5);
  });

  it('un intento obsoleto (otro worker reclamó la fila) cuenta como omitido, no como error', async () => {
    const { processor } = harness([message()], { applied: false });

    expect((await processor.runOnce()).skipped).toBe(1);
  });

  it('un fallo al registrar un mensaje no detiene el resto del lote ni filtra su detalle', async () => {
    const { processor } = harness([message(), message({ outboxId: '60000000-0000-4000-8000-000000000002' })], { failRecord: true });

    const summary = await processor.runOnce();

    expect(summary.skipped).toBe(2);
    expect(JSON.stringify(summary)).not.toContain('canario');
  });

  it('lo registrado nunca contiene destinatario, token ni cuerpo', async () => {
    const { processor, recorded } = harness([message()]);

    await processor.runOnce();

    expect(JSON.stringify(recorded)).not.toMatch(/donante@|tok_canario/);
  });
});
