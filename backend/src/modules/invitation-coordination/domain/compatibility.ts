import type { NeedBloodType as BloodType } from '../../need-records/domain/need-draft.js';

/** Matriz académica donante → receptor, solo RBC (Anexo B.2). No es una fuente clínica (RNF-SAF-01). */
const ALL: readonly BloodType[] = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'];

export const MATRIZ_RBC_ACADEMICA_V1: Readonly<Record<BloodType, readonly BloodType[]>> = Object.freeze({
  O_NEG: ALL,
  O_POS: ['O_POS', 'A_POS', 'B_POS', 'AB_POS'],
  A_NEG: ['A_NEG', 'A_POS', 'AB_NEG', 'AB_POS'],
  A_POS: ['A_POS', 'AB_POS'],
  B_NEG: ['B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
  B_POS: ['B_POS', 'AB_POS'],
  AB_NEG: ['AB_NEG', 'AB_POS'],
  AB_POS: ['AB_POS'],
});

export function isCompatible(donor: BloodType, recipient: BloodType): boolean {
  return MATRIZ_RBC_ACADEMICA_V1[donor].includes(recipient);
}

export function isExactMatch(donor: BloodType, recipient: BloodType): boolean {
  return donor === recipient;
}
