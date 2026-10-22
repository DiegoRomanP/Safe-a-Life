import type { ApproximateLocation } from './location.js';

/** Estados del perfil del donante: `pendiente_verificacion` → `incompleto` → `activo`. */
export const DONOR_STATUSES = ['pendiente_verificacion', 'incompleto', 'activo'] as const;
export type DonorStatus = (typeof DONOR_STATUSES)[number];

export type DonorProfileDraft = Readonly<{
  name: string | null;
  declaredBloodType: string | null;
  isAvailable: boolean | null;
  approximateLocation: ApproximateLocation | null;
}>;

/** Solo estos campos los edita el propio donante después del onboarding (nombre, correo y grupo no). */
export const EDITABLE_DIRECTLY = Object.freeze(['isAvailable', 'approximateLocation'] as const);

/** Un perfil se activa cuando tiene nombre, grupo declarado, disponibilidad y ubicación válida. */
export function canActivate(profile: DonorProfileDraft): boolean {
  return profile.name !== null && profile.name.trim() !== ''
    && profile.declaredBloodType !== null
    && profile.isAvailable !== null
    && profile.approximateLocation !== null;
}

/** Proyección de estado para `DonorOnboarding`: `reclamada_incompleta` = perfil incompleto. */
export function onboardingStatus(status: DonorStatus): 'reclamada_incompleta' | 'activa' {
  return status === 'activo' ? 'activa' : 'reclamada_incompleta';
}
