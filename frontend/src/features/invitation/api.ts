import { apiRequest } from '../../lib/api/http.js';
import { ApiError } from '../../lib/demoApi.js';
import { dataOf, oneOf, rec, str } from '../../lib/api/validate.js';
import type { InvitationActionPreview } from './components/InvitationLinkCard.js';

/** getInvitationActionPreview: sin sesión; el token viaja en la ruta (nunca se registra). 404 = desconocido; 410 = ya no admite respuesta. */
export async function fetchInvitationPreview(token: string): Promise<InvitationActionPreview> {
  const data = rec(dataOf(await apiRequest('GET', `/invitation-actions/${encodeURIComponent(token)}`)));
  return {
    hospitalName: str(data.hospitalName, 160), publicSiteName: str(data.publicSiteName, 160),
    intendedAction: oneOf(data.intendedAction, ['confirmar', 'rechazar'] as const), expiresAt: str(data.expiresAt, 40),
  };
}

export type TokenResponseOutcome = 'ok' | 'unavailable' | 'error';

/**
 * recordInitialInvitationResponse: la acción la fija el token. 404/409/410 (enlace desconocido, gastado, cerrado o con la meta
 * alcanzada) son «no disponible»; ante un fallo sin resolver (red o 5xx) apiRequest reutiliza la misma clave, para que el
 * reintento reciba la respuesta ya registrada y no un 410. 429 es «límite»: hay que esperar, no reintentar enseguida.
 */
export async function respondWithToken(token: string): Promise<TokenResponseOutcome> {
  try {
    await apiRequest('POST', `/invitation-actions/${encodeURIComponent(token)}/response`);
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 410)) return 'unavailable';
    return 'error';
  }
}
