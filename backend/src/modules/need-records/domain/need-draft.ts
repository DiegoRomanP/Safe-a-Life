/** Borrador de necesidad (spec A2 §3.1). Puro: sin reloj, generador de UUID, I/O ni framework. */
export type NeedBloodType =
  | 'O_NEG' | 'O_POS' | 'A_NEG' | 'A_POS'
  | 'B_NEG' | 'B_POS' | 'AB_NEG' | 'AB_POS';
export type NeedUrgency = 'Normal' | 'Urgente' | 'Critica';

export type NormalizedNeedDraftInput = Readonly<{
  component: 'RBC';
  requiredBloodType: NeedBloodType;
  targetConfirmations: number;
  siteId: string;
  radiusKm: number;
  urgency: NeedUrgency;
  expiresInHours: number;
}>;

export type NeedDraftProjection = Readonly<{
  needId: string;
  component: 'RBC';
  requiredBloodType: NeedBloodType;
  targetConfirmations: number;
  confirmedIntentCount: 0;
  siteId: string;
  radiusKm: number;
  urgency: NeedUrgency;
  status: 'borrador';
  expiresAt: string;
}>;

export type NeedDraftOwner = Readonly<{
  actorId: string;
  hospitalId: string;
}>;

export type NeedDraft = Readonly<{
  owner: NeedDraftOwner;
  projection: NeedDraftProjection;
}>;

function copyProjection(projection: NeedDraftProjection): NeedDraftProjection {
  return Object.freeze({
    needId: projection.needId,
    component: projection.component,
    requiredBloodType: projection.requiredBloodType,
    targetConfirmations: projection.targetConfirmations,
    confirmedIntentCount: projection.confirmedIntentCount,
    siteId: projection.siteId,
    radiusKm: projection.radiusKm,
    urgency: projection.urgency,
    status: projection.status,
    expiresAt: projection.expiresAt,
  });
}

/** Copia por campos explícitos: nada de la entrada (extras, prototipos) llega a la entidad. */
export function createNeedDraft(projection: NeedDraftProjection, owner: NeedDraftOwner): NeedDraft {
  return Object.freeze({
    owner: Object.freeze({ actorId: owner.actorId, hospitalId: owner.hospitalId }),
    projection: copyProjection(projection),
  });
}

/** Los diez campos públicos; nunca el propietario ni la entidad. */
export function projectNeedDraft(draft: NeedDraft): NeedDraftProjection {
  return copyProjection(draft.projection);
}
