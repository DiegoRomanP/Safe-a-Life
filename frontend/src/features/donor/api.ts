import { apiRequest } from '../../lib/api/http.js';
import { ApiError } from '../../lib/demoApi.js';
import { BLOOD_TYPES } from '../../lib/format.js';
import { expireSession, getAuthSession } from '../auth/session/session.js';
import type { DonorProfile } from './types.js';

export type ParticipationPatch = Pick<DonorProfile, 'isAvailable' | 'approximateLocation'>;
export type OnboardingData = Omit<DonorProfile, 'email'>;

const csrfToken = () => getAuthSession()?.csrfToken;
// Respuesta con la forma de OwnDonorProfile o fallo: la vista nunca pinta un perfil a medias.
const profileOf = (body: unknown): DonorProfile => {
  const data = (body as { data?: Partial<DonorProfile> } | null)?.data;
  const location = data?.approximateLocation;
  if (typeof data?.name !== 'string' || typeof data.email !== 'string' || !BLOOD_TYPES.includes(data.declaredBloodType as never)
    || typeof data.isAvailable !== 'boolean' || typeof location?.latitude !== 'number' || typeof location.longitude !== 'number') {
    throw new ApiError('red');
  }
  const { name, email, declaredBloodType, isAvailable } = data as DonorProfile;
  return { name, email, declaredBloodType, isAvailable, approximateLocation: { latitude: location.latitude, longitude: location.longitude } };
};

// Un 401 significa que la sesión ya no existe (expiró o se cerró en otra pestaña).
async function call(...args: Parameters<typeof apiRequest>): Promise<unknown> {
  try {
    return await apiRequest(...args);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) expireSession();
    throw error;
  }
}

/** getOwnDonorProfile. `null` = el perfil aún no está activo (404 hasta completar el onboarding). */
export async function fetchOwnProfile(): Promise<DonorProfile | null> {
  try {
    return profileOf(await call('GET', '/donors/me/profile'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** completeDonorOnboarding: fija nombre, grupo declarado, disponibilidad y zona aproximada (activa el perfil). */
export async function completeOwnOnboarding(data: OnboardingData): Promise<DonorProfile> {
  return profileOf(await call('PUT', '/donors/me/onboarding-profile', { body: data, csrfToken: csrfToken() }));
}

/** updateOwnDonorParticipation: solo disponibilidad y zona aproximada. */
export async function updateOwnParticipation(patch: ParticipationPatch): Promise<DonorProfile> {
  return profileOf(await call('PATCH', '/donors/me/profile', { body: patch, csrfToken: csrfToken() }));
}
