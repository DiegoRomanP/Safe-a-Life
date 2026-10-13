import { describe, expect, it } from 'vitest';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { PersistenceUnavailableError } from '../../../shared/persistence/errors.js';
import type { NormalizedNeedDraftInput } from '../domain/need-draft.js';
import { createNeedDraftService, fingerprintNeedDraftInput } from './create-need-draft.js';
import type {
  AtomicNeedDraftCommand, AtomicNeedDraftGateway, CreateNeedDraftContext, ValidatedNeedDraftPrincipal,
} from './create-need-draft.ports.js';

const ACTOR = '00000000-0000-4000-8000-0000000000c1';
const HOSPITAL = '11111111-1111-4111-8111-111111111101';
const SITE = '22222222-2222-4222-8222-222222222201';
const KEY = 'clave-de-prueba-0001';

const BODY = { component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, siteId: SITE, urgency: 'Urgente', expiresInHours: 12 };
const NEED = {
  needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f', component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5,
  confirmedIntentCount: 0, siteId: SITE, radiusKm: 10, urgency: 'Urgente', status: 'borrador', expiresAt: '2026-10-14T12:00:00.123456Z',
};
const OWNER = { actorId: ACTOR, hospitalId: HOSPITAL };
const principal = (overrides: Partial<ValidatedNeedDraftPrincipal> = {}): ValidatedNeedDraftPrincipal => ({
  actorId: ACTOR, role: 'admin_hospitalario', aal: 'aal2', membership: { hospitalId: HOSPITAL, isActive: true, hospitalIsActive: true }, ...overrides,
});
const CONTEXT: CreateNeedDraftContext = { principal: principal() };

/** Sin respuesta explícita, el gateway «persiste» lo pedido y devuelve la necesidad coherente con el comando. */
function harness(reply?: unknown | (() => unknown)) {
  const commands: AtomicNeedDraftCommand[] = [];
  const gateway: AtomicNeedDraftGateway = {
    createDraft: async (command) => {
      commands.push(command);
      if (reply === undefined) {
        const { expiresInHours: _hours, ...requested } = command.input;
        return { kind: 'created', owner: command.owner, need: { ...NEED, ...requested } };
      }
      return typeof reply === 'function' ? (reply as () => unknown)() : reply;
    },
  };
  return { commands, service: createNeedDraftService(gateway) };
}

const NO_KEY = Symbol('sin clave');

async function run(body: unknown, context: CreateNeedDraftContext = CONTEXT, key: unknown = KEY, reply?: unknown | (() => unknown)) {
  const { commands, service } = harness(reply);
  const result = await service(body, context, { key: key === NO_KEY ? undefined : key });
  return { result, commands };
}

describe('precondiciones del principal', () => {
  it('sin principal es AUTHENTICATION_REQUIRED y no llama al gateway', async () => {
    const { result, commands } = await run(BODY, { principal: null });

    expect(result).toEqual({ ok: false, code: 'AUTHENTICATION_REQUIRED' });
    expect(commands).toHaveLength(0);
  });

  it.each([
    ['donante', principal({ role: 'donante' })],
    ['superadmin', principal({ role: 'superadmin' })],
    ['AAL1', principal({ aal: 'aal1' })],
    ['membresía nula', principal({ membership: null })],
    ['membresía inactiva', principal({ membership: { hospitalId: HOSPITAL, isActive: false, hospitalIsActive: true } })],
    ['hospital inactivo', principal({ membership: { hospitalId: HOSPITAL, isActive: true, hospitalIsActive: false } })],
  ])('%s es ACCESS_DENIED y no llama al gateway', async (_label, denied) => {
    const { result, commands } = await run(BODY, { principal: denied });

    expect(result).toEqual({ ok: false, code: 'ACCESS_DENIED' });
    expect(commands).toHaveLength(0);
  });
});

describe('clave de idempotencia', () => {
  it.each([
    ['ausente', NO_KEY], ['null', null], ['número', 12345678901234567], ['15 caracteres', 'a'.repeat(15)], ['256 caracteres', 'a'.repeat(256)],
  ])('%s es BAD_REQUEST sin gateway', async (_label, key) => {
    const { result, commands } = await run(BODY, CONTEXT, key);

    expect(result).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(commands).toHaveLength(0);
  });

  it('acepta 16 y 255 puntos de código (no bytes) y no altera la clave', async () => {
    for (const key of ['a'.repeat(16), '🩸'.repeat(16), 'b'.repeat(255), '🩸'.repeat(255)]) {
      const { result, commands } = await run(BODY, CONTEXT, key);

      expect(result.ok).toBe(true);
      expect(commands[0].idempotency.key).toBe(key);
    }
  });
});

describe('entrada', () => {
  it.each([
    ['null', null], ['arreglo', []], ['cadena', 'x'], ['falta urgency', { ...BODY, urgency: undefined }],
    ['propiedad desconocida', { ...BODY, hospitalId: HOSPITAL }], ['rol', { ...BODY, role: 'admin_hospitalario' }],
    ['estado', { ...BODY, status: 'activa' }], ['paciente', { ...BODY, patientName: 'sintético' }],
    ['UUID inválido', { ...BODY, siteId: 'no-es-uuid' }], ['meta fraccionaria', { ...BODY, targetConfirmations: 2.5 }],
    ['meta en cadena', { ...BODY, targetConfirmations: '5' }], ['horas null', { ...BODY, expiresInHours: null }],
    ['radio fraccionario', { ...BODY, radiusKm: 10.5 }],
  ])('%s es BAD_REQUEST sin gateway', async (_label, body) => {
    const { result, commands } = await run(body);

    expect(result).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(commands).toHaveLength(0);
  });

  it.each([
    ['grupo desconocido', { requiredBloodType: 'XX' }], ['componente distinto', { component: 'PLT' }], ['urgencia desconocida', { urgency: 'Maxima' }],
    ['meta 0', { targetConfirmations: 0 }], ['meta 51', { targetConfirmations: 51 }], ['radio 0', { radiusKm: 0 }],
    ['radio 51', { radiusKm: 51 }], ['horas 0', { expiresInHours: 0 }], ['horas 73', { expiresInHours: 73 }],
  ])('%s es VALIDATION_FAILED sin gateway', async (_label, patch) => {
    const { result, commands } = await run({ ...BODY, ...patch });

    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(commands).toHaveLength(0);
  });

  it('acepta los límites 1/50 de meta y radio y 1/72 de horas', async () => {
    for (const patch of [{ targetConfirmations: 1 }, { targetConfirmations: 50 }, { radiusKm: 1 }, { radiusKm: 50 }, { expiresInHours: 1 }, { expiresInHours: 72 }]) {
      expect((await run({ ...BODY, ...patch })).result.ok).toBe(true);
    }
  });

  it('rechaza __proto__ propio y propiedades heredadas', async () => {
    const own = JSON.parse(`{"__proto__":{"x":1},"component":"RBC","requiredBloodType":"O_NEG","targetConfirmations":5,"siteId":"${SITE}","urgency":"Urgente","expiresInHours":12}`);
    const inherited = Object.create({ hospitalId: HOSPITAL }, Object.getOwnPropertyDescriptors(BODY));

    expect((await run(own)).result).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect((await run(inherited)).result).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });
});

describe('comando atómico', () => {
  it('llama una sola vez con entrada normalizada, propietario de la membresía y operación literal', async () => {
    const { result, commands } = await run(BODY);

    expect(result.ok).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      input: { component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, siteId: SITE, radiusKm: 10, urgency: 'Urgente', expiresInHours: 12 },
      owner: OWNER,
      idempotency: { operation: 'createHospitalNeed', key: KEY, payloadHash: fingerprintNeedDraftInput(commands[0].input) },
    });
    expect(Object.isFrozen(commands[0])).toBe(true);
    expect(Object.isFrozen(commands[0].input)).toBe(true);
    expect(Object.isFrozen(commands[0].owner)).toBe(true);
    expect(Object.isFrozen(commands[0].idempotency)).toBe(true);
  });

  it('el orden de las propiedades del body y el radio omitido o igual a 10 dan el mismo hash', async () => {
    const reordered = { expiresInHours: 12, urgency: 'Urgente', siteId: SITE, targetConfirmations: 5, requiredBloodType: 'O_NEG', component: 'RBC' };
    const hashes = await Promise.all([BODY, reordered, { ...BODY, radiusKm: 10 }].map(async (body) => (await run(body)).commands[0].idempotency.payloadHash));

    expect(new Set(hashes).size).toBe(1);
  });

  it('cualquier cambio en un campo normalizado produce otro hash', async () => {
    const base = (await run(BODY)).commands[0].idempotency.payloadHash;
    const patches = [
      { requiredBloodType: 'A_POS' }, { targetConfirmations: 6 }, { siteId: '22222222-2222-4222-8222-222222222203' },
      { radiusKm: 11 }, { urgency: 'Normal' }, { expiresInHours: 13 },
    ];
    const hashes = await Promise.all(patches.map(async (patch) => (await run({ ...BODY, ...patch })).commands[0].idempotency.payloadHash));

    expect(new Set([base, ...hashes]).size).toBe(patches.length + 1);
  });

  it('no normaliza el UUID: el casing de la sede viaja literal y cambia el hash', async () => {
    const lower = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    const upper = lower.toUpperCase();
    const a = await run({ ...BODY, siteId: lower });
    const b = await run({ ...BODY, siteId: upper });

    expect(b.commands[0].input.siteId).toBe(upper);
    expect(b.commands[0].idempotency.payloadHash).not.toBe(a.commands[0].idempotency.payloadHash);
  });

  it('no incluye clave, actor ni hospital en el hash', async () => {
    const a = (await run(BODY, CONTEXT, 'clave-de-prueba-0001')).commands[0].idempotency.payloadHash;
    const b = (await run(BODY, { principal: principal({ actorId: '00000000-0000-4000-8000-0000000000c2' }) }, 'otra-clave-distinta-0002', {
      kind: 'created', owner: { actorId: '00000000-0000-4000-8000-0000000000c2', hospitalId: HOSPITAL }, need: NEED,
    })).commands[0].idempotency.payloadHash;

    expect(a).toBe(b);
  });
});

describe('UUID de la sede', () => {
  it('un UUID con letras en mayúsculas se acepta aunque la base lo devuelva en minúsculas', async () => {
    const lower = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    const { result, commands } = await run({ ...BODY, siteId: lower.toUpperCase() }, CONTEXT, KEY, { kind: 'created', owner: OWNER, need: { ...NEED, siteId: lower } });

    expect(result.ok).toBe(true);
    expect(commands[0].input.siteId).toBe(lower.toUpperCase());
  });

  it('la forma urn:uuid: (admitida por el formato del contrato, rechazada por la base) es BAD_REQUEST sin gateway', async () => {
    const { result, commands } = await run({ ...BODY, siteId: `urn:uuid:${SITE}` });

    expect(result).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(commands).toHaveLength(0);
  });
});

describe('fingerprintNeedDraftInput', () => {
  const INPUT: NormalizedNeedDraftInput = { component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, siteId: SITE, radiusKm: 10, urgency: 'Urgente', expiresInHours: 12 };

  it('es el SHA-256 del JSON compacto de los siete campos en el orden fijado', () => {
    expect(fingerprintNeedDraftInput(INPUT)).toBe(fingerprint([
      ['component', 'RBC'], ['requiredBloodType', 'O_NEG'], ['targetConfirmations', 5], ['siteId', SITE],
      ['radiusKm', 10], ['urgency', 'Urgente'], ['expiresInHours', 12],
    ]));
    expect(fingerprintNeedDraftInput(INPUT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('coincide con el valor fijo que verifica pgTAP (paridad TS↔SQL)', () => {
    // Si este valor cambia, debe cambiar también la prueba pgTAP 03_need_records.
    expect(fingerprintNeedDraftInput(INPUT)).toBe('116fd26f7a02120b76a19c5cb88528431f862c2c6870148e72a0abd426562447');
  });
});

describe('respuestas del gateway', () => {
  it('created y replayed entregan la proyección de diez campos congelada y conservan el plazo original', async () => {
    const created = await run(BODY, CONTEXT, KEY, { kind: 'created', owner: OWNER, need: NEED });
    const replayed = await run(BODY, CONTEXT, KEY, { kind: 'replayed', owner: OWNER, need: { ...NEED, expiresAt: '2020-01-01T00:00:00Z' } });

    expect(created.result).toMatchObject({ ok: true, outcome: 'created', need: NEED });
    expect(replayed.result).toMatchObject({ ok: true, outcome: 'replayed' });
    expect((replayed.result as { need: { expiresAt: string } }).need.expiresAt).toBe('2020-01-01T00:00:00Z');
    if (created.result.ok) {
      expect(Object.keys(created.result.need)).toHaveLength(10);
      expect(Object.isFrozen(created.result)).toBe(true);
      expect(Object.isFrozen(created.result.need)).toBe(true);
    }
  });

  it.each([
    ['payload_conflict', 'STATE_CONFLICT'], ['in_progress', 'STATE_CONFLICT'], ['site_unusable', 'VALIDATION_FAILED'],
    ['forbidden', 'ACCESS_DENIED'], ['unauthenticated', 'AUTHENTICATION_REQUIRED'], ['failed', 'INTERNAL_ERROR'],
    ['rate_limited', 'RATE_LIMITED'],
  ])('el reply %s se traduce a %s', async (kind, code) => {
    expect((await run(BODY, CONTEXT, KEY, { kind })).result).toEqual({ ok: false, code });
  });

  it('payload_conflict e in_progress son indistinguibles para el llamador', async () => {
    const a = await run(BODY, CONTEXT, KEY, { kind: 'payload_conflict' });
    const b = await run(BODY, CONTEXT, KEY, { kind: 'in_progress' });

    expect(a.result).toEqual(b.result);
  });

  const CORRUPT: ReadonlyArray<readonly [string, unknown]> = [
    ['reply nulo', null], ['reply arreglo', []], ['kind desconocido', { kind: 'otra' }],
    ['fallo con campos extra', { kind: 'forbidden', detail: 'x' }],
    ['éxito sin owner', { kind: 'created', need: NEED }],
    ['éxito con campo extra en la raíz', { kind: 'created', owner: OWNER, need: NEED, extra: 1 }],
    ['owner con campo extra', { kind: 'created', owner: { ...OWNER, email: 'x' }, need: NEED }],
    ['owner de otro actor', { kind: 'created', owner: { ...OWNER, actorId: '00000000-0000-4000-8000-0000000000c9' }, need: NEED }],
    ['owner de otro hospital (replay)', { kind: 'replayed', owner: { ...OWNER, hospitalId: '11111111-1111-4111-8111-111111111102' }, need: NEED }],
    ['need con campo extra', { kind: 'created', owner: OWNER, need: { ...NEED, hospitalId: HOSPITAL } }],
    ['need sin un campo', { kind: 'created', owner: OWNER, need: { ...NEED, expiresAt: undefined } }],
    ['fila SQL cruda', { kind: 'created', owner: OWNER, need: { need_id: NEED.needId, status: 'borrador' } }],
    ['estado activa', { kind: 'created', owner: OWNER, need: { ...NEED, status: 'activa' } }],
    ['conteo 1', { kind: 'created', owner: OWNER, need: { ...NEED, confirmedIntentCount: 1 } }],
    ['fecha inválida', { kind: 'created', owner: OWNER, need: { ...NEED, expiresAt: 'mañana' } }],
    ['fecha con offset', { kind: 'created', owner: OWNER, need: { ...NEED, expiresAt: '2026-10-14T12:00:00+02:00' } }],
    ['grupo distinto al pedido', { kind: 'created', owner: OWNER, need: { ...NEED, requiredBloodType: 'A_POS' } }],
    ['meta distinta', { kind: 'created', owner: OWNER, need: { ...NEED, targetConfirmations: 6 } }],
    ['sede distinta', { kind: 'created', owner: OWNER, need: { ...NEED, siteId: '22222222-2222-4222-8222-222222222203' } }],
    ['radio distinto', { kind: 'created', owner: OWNER, need: { ...NEED, radiusKm: 11 } }],
    ['urgencia distinta', { kind: 'created', owner: OWNER, need: { ...NEED, urgency: 'Normal' } }],
    ['prototipo no plano', Object.create({ kind: 'created' })],
  ];

  it.each(CORRUPT)('respuesta corrupta (%s) es INTERNAL_ERROR sin fuga de datos', async (_label, reply) => {
    const { result } = await run(BODY, CONTEXT, KEY, () => reply);

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });

  it('un getter hostil en la respuesta es INTERNAL_ERROR', async () => {
    const hostile = { kind: 'created', owner: OWNER, get need(): never { throw new Error('canario-getter'); } };

    expect((await run(BODY, CONTEXT, KEY, () => hostile)).result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });
});

describe('fallos del gateway', () => {
  it('un throw es INTERNAL_ERROR genérico, llamado una vez y sin eco de canarios', async () => {
    let calls = 0;
    const service = createNeedDraftService({ createDraft: async () => { calls += 1; throw new Error('canario-sql postgres://u:p@h clave-secreta'); } });

    const result = await service(BODY, CONTEXT, { key: KEY });

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('canario');
    expect(calls).toBe(1);
  });

  it('la indisponibilidad de la persistencia se propaga para responder 503 (no se oculta como 500)', async () => {
    const service = createNeedDraftService({ createDraft: async () => { throw new PersistenceUnavailableError(); } });

    await expect(service(BODY, CONTEXT, { key: KEY })).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });
});

describe('aislamiento de entradas', () => {
  it('mutar body, contexto y membresía mientras el gateway espera no altera el comando ni el resultado', async () => {
    const body = { ...BODY };
    const membership = { hospitalId: HOSPITAL, isActive: true, hospitalIsActive: true };
    const context: CreateNeedDraftContext = { principal: principal({ membership }) };
    let seen: AtomicNeedDraftCommand | undefined;
    const service = createNeedDraftService({
      createDraft: async (command) => {
        seen = command;
        body.urgency = 'Normal';
        (membership as { hospitalId: string }).hospitalId = 'otro';
        return { kind: 'created', owner: OWNER, need: NEED };
      },
    });

    const result = await service(body, context, { key: KEY });

    expect(result.ok).toBe(true);
    expect(seen?.input.urgency).toBe('Urgente');
    expect(seen?.owner.hospitalId).toBe(HOSPITAL);
  });

  it('mutar la respuesta del gateway después de resolver no cambia el resultado entregado', async () => {
    const reply = { kind: 'created', owner: { ...OWNER }, need: { ...NEED } };
    const service = createNeedDraftService({ createDraft: async () => reply });

    const result = await service(BODY, CONTEXT, { key: KEY });
    reply.need.radiusKm = 50;

    expect(result).toMatchObject({ ok: true, need: { radiusKm: 10 } });
  });

  it('dos servicios con gateways independientes no comparten estado', async () => {
    const a = harness({ kind: 'forbidden' });
    const b = harness();

    expect((await a.service(BODY, CONTEXT, { key: KEY })).ok).toBe(false);
    expect((await b.service(BODY, CONTEXT, { key: KEY })).ok).toBe(true);
    expect(a.commands).toHaveLength(1);
    expect(b.commands).toHaveLength(1);
  });
});
