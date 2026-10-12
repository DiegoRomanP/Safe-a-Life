import { describe, expect, it } from 'vitest';
import {
  NeedDtoError,
  parseCreateNeedInput,
  parseCreatedNeedEnvelope,
  type NeedDtoErrorCategory,
} from './validators.js';

const bloodTypes = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'];
const urgencies = ['Normal', 'Urgente', 'Critica'];
const needFields = [
  'needId', 'component', 'requiredBloodType', 'targetConfirmations', 'confirmedIntentCount',
  'siteId', 'radiusKm', 'urgency', 'status', 'expiresAt',
];

function validInput(): Record<string, unknown> {
  return {
    component: 'RBC',
    requiredBloodType: 'O_POS',
    targetConfirmations: 5,
    siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
    urgency: 'Urgente',
    expiresInHours: 24,
  };
}

function validEnvelope(): { data: Record<string, unknown> } {
  return {
    data: {
      needId: '6f01119f-152e-46d6-b997-cb7de7c64211',
      component: 'RBC',
      requiredBloodType: 'O_POS',
      targetConfirmations: 5,
      confirmedIntentCount: 0,
      siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
      radiusKm: 10,
      urgency: 'Urgente',
      status: 'borrador',
      expiresAt: '2026-10-05T12:00:00Z',
    },
  };
}

function expectDtoError(action: () => unknown, category: NeedDtoErrorCategory, canary?: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(NeedDtoError);
  if (!(thrown instanceof NeedDtoError)) return;

  expect(thrown.category).toBe(category);
  expect(thrown.message).toBe({
    shape: 'La forma de la solicitud no es válida.',
    rule: 'Uno o más valores no cumplen las reglas del campo.',
    output: 'La respuesta de la necesidad no es válida.',
  }[category]);
  expect('status' in thrown).toBe(false);
  expect('errors' in thrown).toBe(false);
  expect('issues' in thrown).toBe(false);
  expect('cause' in thrown).toBe(false);
  if (canary) expect(JSON.stringify(thrown)).not.toContain(canary);
}

describe('parseCreateNeedInput', () => {
  it('normalizes an omitted radius to 10 without mutating the input', () => {
    const input = validInput();
    const original = structuredClone(input);

    const normalized = parseCreateNeedInput(input);

    expect(normalized.radiusKm).toBe(10);
    expect(Object.keys(normalized).sort()).toEqual([
      'component', 'expiresInHours', 'radiusKm', 'requiredBloodType', 'siteId', 'targetConfirmations', 'urgency',
    ]);
    expect(input).toEqual(original);
  });

  it('makes omitted radius and explicit 10 the same normalized intent', () => {
    const omitted = parseCreateNeedInput(validInput());
    const explicit = parseCreateNeedInput({ ...validInput(), radiusKm: 10 });
    expect(omitted).toEqual(explicit);
  });

  it.each([1, 10, 50])('accepts integer radius %i', (radiusKm) => {
    expect(parseCreateNeedInput({ ...validInput(), radiusKm }).radiusKm).toBe(radiusKm);
  });

  it.each([
    [0, 'rule'], [51, 'rule'], [1.5, 'shape'], ['10', 'shape'], [null, 'shape'], [Number.NaN, 'shape'],
    [Number.POSITIVE_INFINITY, 'shape'],
  ] as Array<[unknown, NeedDtoErrorCategory]>)('rejects radius %s as %s', (radiusKm, category) => {
    expectDtoError(() => parseCreateNeedInput({ ...validInput(), radiusKm }), category);
  });

  it.each([
    [0, 'rule'], [1, 'valid'], [50, 'valid'], [51, 'rule'], [1.2, 'shape'], ['5', 'shape'],
  ] as Array<[unknown, 'shape' | 'rule' | 'valid']>)('validates targetConfirmations %s', (target, category) => {
    const action = () => parseCreateNeedInput({ ...validInput(), targetConfirmations: target });
    if (category === 'valid') expect(action()).toBeDefined();
    else expectDtoError(action, category);
  });

  it.each([
    [0, 'rule'], [1, 'valid'], [72, 'valid'], [73, 'rule'], [1.5, 'shape'], ['24', 'shape'],
  ] as Array<[unknown, 'shape' | 'rule' | 'valid']>)('validates expiresInHours %s', (hours, category) => {
    const action = () => parseCreateNeedInput({ ...validInput(), expiresInHours: hours });
    if (category === 'valid') expect(action()).toBeDefined();
    else expectDtoError(action, category);
  });

  it.each(bloodTypes)('accepts requiredBloodType %s', (requiredBloodType) => {
    expect(parseCreateNeedInput({ ...validInput(), requiredBloodType }).requiredBloodType).toBe(requiredBloodType);
  });

  it.each(urgencies)('accepts urgency %s', (urgency) => {
    expect(parseCreateNeedInput({ ...validInput(), urgency }).urgency).toBe(urgency);
  });

  it.each([
    ['component', 'PLASMA', 'rule'],
    ['component', 7, 'shape'],
    ['requiredBloodType', 'O+', 'rule'],
    ['requiredBloodType', 2, 'shape'],
    ['urgency', 'immediate', 'rule'],
    ['urgency', false, 'shape'],
    ['siteId', 'not-a-uuid', 'shape'],
  ] as Array<[string, unknown, NeedDtoErrorCategory]>)('categorizes invalid %s safely', (field, value, category) => {
    expectDtoError(() => parseCreateNeedInput({ ...validInput(), [field]: value }), category);
  });

  it.each(['component', 'requiredBloodType', 'targetConfirmations', 'siteId', 'urgency', 'expiresInHours'])
    ('rejects missing required field %s', (field) => {
      const input = validInput();
      delete input[field];
      expectDtoError(() => parseCreateNeedInput(input), 'shape');
    });

  it.each([
    'role', 'hospitalId', 'ownerId', 'status', 'confirmedIntentCount', 'patientId', 'lastDonationDate',
    'donationHistory', 'latitude',
  ])('rejects forbidden extra property %s', (field) => {
    expectDtoError(() => parseCreateNeedInput({ ...validInput(), [field]: 'synthetic-canary' }), 'shape', 'synthetic-canary');
  });

  it.each([null, [], 'not-an-object', Number.NaN, Number.POSITIVE_INFINITY])('rejects non-object root %s', (value) => {
    expectDtoError(() => parseCreateNeedInput(value), 'shape');
  });

  it('rejects inherited required fields and own __proto__ extras', () => {
    const inherited = Object.assign(Object.create({ component: 'RBC' }), {
      requiredBloodType: 'O_POS', targetConfirmations: 5, siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
      urgency: 'Urgente', expiresInHours: 24,
    });
    expectDtoError(() => parseCreateNeedInput(inherited), 'shape');

    const withProto = validInput();
    Object.defineProperty(withProto, '__proto__', { value: { role: 'superadmin' }, enumerable: true });
    expectDtoError(() => parseCreateNeedInput(withProto), 'shape');
  });

  it('prioritizes shape failures over rule failures without exposing validation details', () => {
    const input = { ...validInput(), requiredBloodType: 42, component: 'WRONG', secretCanary: 'not-public' };
    expectDtoError(() => parseCreateNeedInput(input), 'shape', 'secretCanary');
  });
});

describe('parseCreatedNeedEnvelope', () => {
  it('accepts and returns the complete ten-field draft projection', () => {
    const envelope = validEnvelope();
    const original = structuredClone(envelope);

    const parsed = parseCreatedNeedEnvelope(envelope);

    expect(Object.keys(parsed.data).sort()).toEqual([...needFields].sort());
    expect(parsed.data.status).toBe('borrador');
    expect(parsed.data.confirmedIntentCount).toBe(0);
    expect(envelope).toEqual(original);
  });

  it.each(needFields)('rejects missing output field %s generically', (field) => {
    const envelope = validEnvelope();
    delete envelope.data[field];
    expectDtoError(() => parseCreatedNeedEnvelope(envelope), 'output');
  });

  it.each([
    (envelope: ReturnType<typeof validEnvelope>) => { Object.assign(envelope, { extra: 'synthetic' }); },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.hospitalId = 'synthetic'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.createdAt = '2026-10-04T12:00:00Z'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.status = 'activa'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.confirmedIntentCount = 1; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.component = 'PLASMA'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.radiusKm = 0; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.expiresAt = '2026-10-05T12:00:00+00:00'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.expiresAt = '2026-02-30T12:00:00Z'; },
    (envelope: ReturnType<typeof validEnvelope>) => { envelope.data.expiresAt = 'not-a-date'; },
  ])('rejects output projection violations without surfacing details', (mutate) => {
    const envelope = validEnvelope();
    mutate(envelope);
    expectDtoError(() => parseCreatedNeedEnvelope(envelope), 'output', 'synthetic');
  });

  it('rejects an inherited output field and does not serialize raw response values', () => {
    const output = validEnvelope();
    output.data = Object.assign(Object.create({ patientName: 'synthetic-private-canary' }), output.data);
    expectDtoError(() => parseCreatedNeedEnvelope(output), 'output', 'synthetic-private-canary');
  });
});
