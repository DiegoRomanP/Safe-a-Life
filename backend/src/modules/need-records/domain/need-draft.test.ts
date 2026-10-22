import { describe, expect, it } from 'vitest';
import { createNeedDraft, projectNeedDraft, type NeedDraftOwner, type NeedDraftProjection } from './need-draft.js';

const PROJECTION: NeedDraftProjection = {
  needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
  component: 'RBC',
  requiredBloodType: 'O_NEG',
  targetConfirmations: 5,
  confirmedIntentCount: 0,
  siteId: '22222222-2222-4222-8222-222222222201',
  radiusKm: 10,
  urgency: 'Urgente',
  status: 'borrador',
  expiresAt: '2026-10-14T12:00:00.123456Z',
};
const OWNER: NeedDraftOwner = { actorId: '00000000-0000-4000-8000-0000000000c1', hospitalId: '11111111-1111-4111-8111-111111111101' };

describe('createNeedDraft', () => {
  it('conserva propietario y proyección y congela entidad, propietario y proyección', () => {
    const draft = createNeedDraft(PROJECTION, OWNER);

    expect(draft.owner).toEqual(OWNER);
    expect(draft.projection).toEqual(PROJECTION);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.owner)).toBe(true);
    expect(Object.isFrozen(draft.projection)).toBe(true);
  });

  it('copia por campos explícitos: mutar la entrada original no altera la entidad', () => {
    const projection = { ...PROJECTION };
    const owner = { ...OWNER };
    const draft = createNeedDraft(projection, owner);

    (projection as { radiusKm: number }).radiusKm = 50;
    (owner as { hospitalId: string }).hospitalId = 'otro';

    expect(draft.projection.radiusKm).toBe(10);
    expect(draft.owner.hospitalId).toBe(OWNER.hospitalId);
  });

  it('descarta campos extra de la entrada (no los arrastra a la entidad)', () => {
    const hostile = { ...PROJECTION, hospitalId: 'x', patientName: 'sintético' } as unknown as NeedDraftProjection;

    const draft = createNeedDraft(hostile, { ...OWNER, extra: 1 } as unknown as NeedDraftOwner);

    expect(Object.keys(draft.projection).sort()).toEqual(Object.keys(PROJECTION).sort());
    expect(Object.keys(draft.owner).sort()).toEqual(['actorId', 'hospitalId']);
  });

  it('preserva el expiresAt literal, con seis cifras fraccionarias', () => {
    expect(createNeedDraft(PROJECTION, OWNER).projection.expiresAt).toBe('2026-10-14T12:00:00.123456Z');
  });
});

describe('projectNeedDraft', () => {
  it('devuelve exactamente los diez campos, sin propietario ni entidad', () => {
    const projected = projectNeedDraft(createNeedDraft(PROJECTION, OWNER));

    expect(Object.keys(projected)).toEqual(Object.keys(PROJECTION));
    expect(projected).toEqual(PROJECTION);
    expect(projected).not.toHaveProperty('owner');
    expect(projected).not.toHaveProperty('hospitalId');
  });

  it('devuelve otra copia congelada en cada llamada', () => {
    const draft = createNeedDraft(PROJECTION, OWNER);
    const first = projectNeedDraft(draft);
    const second = projectNeedDraft(draft);

    expect(first).not.toBe(second);
    expect(first).not.toBe(draft.projection);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('dos entidades no comparten referencias mutables', () => {
    const a = createNeedDraft(PROJECTION, OWNER);
    const b = createNeedDraft(PROJECTION, OWNER);

    expect(a.projection).not.toBe(b.projection);
    expect(a.owner).not.toBe(b.owner);
  });
});
