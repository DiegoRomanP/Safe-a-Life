import { apiRequest } from '../../lib/api/http.js';
import { parseCorrectionRequest } from '../../lib/api/correctionRequest.js';
import { dataOf, listAll, oneOf, rec, str } from '../../lib/api/validate.js';
import { ApiError } from '../../lib/demoApi.js';
import { BLOOD_TYPES } from '../../lib/format.js';
import { expireSession, getAuthSession } from '../auth/session/session.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, InvitationResponse, ResponseHistoryItem } from './types.js';

// Cuerpo de createOwnCorrectionRequest (oneOf del contrato).
export type NewCorrectionRequest =
  | { type: 'correccion'; changes: { name?: string; newEmail?: string; declaredBloodType?: DonorProfile['declaredBloodType'] } }
  | { type: 'eliminacion' };

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

/** listOwnCorrectionRequests (todas las páginas). */
export const fetchOwnRequests = (): Promise<CorrectionRequest[]> => listAll(call, '/donors/me/correction-requests', parseCorrectionRequest);

/** createOwnCorrectionRequest: 201 con la solicitud pendiente; 409 si ya hay una abierta sobre lo mismo. */
export async function createOwnRequest(request: NewCorrectionRequest): Promise<CorrectionRequest> {
  return parseCorrectionRequest(dataOf(await call('POST', '/donors/me/correction-requests', { body: request, csrfToken: csrfToken() })));
}

const URGENCIES = ['Normal', 'Urgente', 'Critica'] as const;
const RESPONSES = ['sin_respuesta', 'confirmada', 'rechazada'] as const;

// InvitationListItem: forma cerrada; una respuesta inesperada nunca se pinta a medias.
const parseInvitation = (value: unknown): DonorInvitation => {
  const v = rec(value);
  return {
    invitationId: str(v.invitationId, 64), hospitalName: str(v.hospitalName, 160), publicSiteName: str(v.publicSiteName, 160),
    requiredBloodType: oneOf(v.requiredBloodType, BLOOD_TYPES), urgency: oneOf(v.urgency, URGENCIES), instructions: str(v.instructions, 1000),
    expiresAt: str(v.expiresAt, 40), validity: oneOf(v.validity, ['activa', 'invalidada', 'vencida'] as const),
    delivery: oneOf(v.delivery, ['pendiente', 'enviada', 'entregada', 'fallida'] as const), response: oneOf(v.response, RESPONSES),
  };
};

/** listOwnInvitations (todas las páginas). */
export const fetchOwnInvitations = (): Promise<DonorInvitation[]> => listAll(call, '/donors/me/invitations', parseInvitation);

/** getOwnInvitation: una ajena o inexistente es 404 (se ve como «sin permiso»). */
export async function fetchOwnInvitation(invitationId: string): Promise<DonorInvitation> {
  return parseInvitation(rec(dataOf(await call('GET', `/donors/me/invitations/${encodeURIComponent(invitationId)}`))).invitation);
}

/** listOwnResponseHistory (todas las páginas). */
export const fetchOwnHistory = (): Promise<ResponseHistoryItem[]> =>
  listAll(call, '/donors/me/responses', (value): ResponseHistoryItem => {
    const v = rec(value);
    return { invitationId: str(v.invitationId, 64), response: oneOf(v.response, ['confirmada', 'rechazada'] as const), changedAt: str(v.changedAt, 40) };
  });

/** changeOwnInvitationResponse: 409 si ya no admite cambios (cerrada, vencida o meta alcanzada). */
export async function changeInvitationResponse(invitationId: string, response: Exclude<InvitationResponse, 'sin_respuesta'>): Promise<void> {
  await call('PATCH', `/donors/me/invitations/${encodeURIComponent(invitationId)}/response`, { body: { response }, csrfToken: csrfToken() });
}
