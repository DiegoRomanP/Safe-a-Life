import type { components, operations } from './openapi.js';

type Schemas = components['schemas'];

export type ActorRole = Schemas['ActorRole'];
export type AuthSession = Schemas['AuthSessionEnvelope']['data'];
export type DonorProfile = Schemas['OwnDonorProfile'];
export type DonorInvitation = Schemas['InvitationListItem'];
export type DonorResponseHistoryItem = Schemas['ResponseHistoryItem'];
export type DonorCorrectionRequest = Schemas['CorrectionRequestSummary'];
export type CreateCorrectionRequestInput = Schemas['CreateCorrectionRequest'];
export type Need = Schemas['Need'];
export type NeedResponse =
  | Schemas['OpaqueHospitalResponse']
  | Schemas['ConfirmedHospitalResponse'];
export type SuperadminTask = Schemas['SuperadminTask'];
export type HospitalRecord = Schemas['Hospital'];
export type AuditEvent = Schemas['AuditEvent'];
export type UpdateDonorProfileInput = Schemas['UpdateDonorProfileRequest'];
export type CreateNeedInput = Schemas['CreateNeedRequest'];
export type InvitationBatchRecord = Schemas['InvitationBatchRecord'];
export type InvitationBatchPage = Schemas['InvitationBatchListEnvelope']['data'];
type BatchPageQuery = NonNullable<operations['listOwnInvitationBatches']['parameters']['query']>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
const pendingMutationKeys = new Map<string, { payloadSignature: string; key: string }>();
let pendingLoginKey: { payloadSignature: string; key: string } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

async function requestData<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('No se pudo leer la respuesta del servicio.', response.status, 'INVALID_RESPONSE');
  }

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    if (response.status === 401 && path !== '/auth/sessions') {
      csrfToken = null;
      pendingMutationKeys.clear();
      pendingLoginKey = null;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('save-a-life:session-expired'));
      }
    }
    throw new ApiError(
      typeof error.message === 'string' ? error.message : 'No se pudo completar la solicitud.',
      response.status,
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.correlationId === 'string' ? error.correlationId : undefined,
    );
  }

  if (!isRecord(payload) || !('data' in payload)) {
    throw new ApiError('La respuesta del servicio no tiene el formato esperado.', response.status, 'INVALID_RESPONSE');
  }
  return payload.data as T;
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const data = await requestData<Schemas['CsrfTokenEnvelope']['data']>('/auth/csrf-token');
  csrfToken = data.token;
  return csrfToken;
}

async function mutate<T>(path: string, method: 'PATCH' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const token = await getCsrfToken();
  const operation = `${method}:${path}`;
  const payloadSignature = stableSerialize(body);
  const previous = pendingMutationKeys.get(operation);
  const idempotencyKey = previous?.payloadSignature === payloadSignature
    ? previous.key
    : crypto.randomUUID();
  const headers = new Headers({
    'Idempotency-Key': idempotencyKey,
    'X-CSRF-Token': token,
  });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  try {
    const result = await requestData<T>(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    pendingMutationKeys.delete(operation);
    return result;
  } catch (error) {
    const outcomeMayBeUnknown = !(error instanceof ApiError)
      || error.status >= 500
      || error.code === 'INVALID_RESPONSE';
    if (outcomeMayBeUnknown) pendingMutationKeys.set(operation, { payloadSignature, key: idempotencyKey });
    else pendingMutationKeys.delete(operation);
    throw error;
  }
}

export const api = {
  getCurrentSession(): Promise<AuthSession> {
    return requestData<AuthSession>('/auth/session');
  },

  async login(email: string, password: string): Promise<AuthSession> {
    csrfToken = null;
    const body = { email, password };
    const payloadSignature = stableSerialize(body);
    const idempotencyKey = pendingLoginKey?.payloadSignature === payloadSignature
      ? pendingLoginKey.key
      : crypto.randomUUID();
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    });
    try {
      const result = await requestData<AuthSession>('/auth/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      pendingLoginKey = null;
      pendingMutationKeys.clear();
      return result;
    } catch (error) {
      const outcomeMayBeUnknown = !(error instanceof ApiError)
        || error.status >= 500
        || error.code === 'INVALID_RESPONSE';
      pendingLoginKey = outcomeMayBeUnknown ? { payloadSignature, key: idempotencyKey } : null;
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await mutate<void>('/auth/sessions/current', 'DELETE');
    } catch (error) {
      const outcomeMayBeUnknown = !(error instanceof ApiError)
        || error.status >= 500
        || error.code === 'INVALID_RESPONSE';
      if (!outcomeMayBeUnknown) throw error;
      await mutate<void>('/auth/sessions/current', 'DELETE');
    }
    csrfToken = null;
  },

  getDonorProfile(): Promise<DonorProfile> {
    return requestData<DonorProfile>('/donors/me/profile');
  },

  updateDonorProfile(input: UpdateDonorProfileInput): Promise<DonorProfile> {
    return mutate<DonorProfile>('/donors/me/profile', 'PATCH', input);
  },

  getDonorInvitations(): Promise<DonorInvitation[]> {
    return requestData<Schemas['OwnInvitationsEnvelope']['data']>('/donors/me/invitations')
      .then((data) => data.items);
  },

  getDonorResponseHistory(): Promise<DonorResponseHistoryItem[]> {
    return requestData<Schemas['OwnResponseHistoryEnvelope']['data']>('/donors/me/responses')
      .then((data) => data.items);
  },

  getDonorCorrectionRequests(): Promise<DonorCorrectionRequest[]> {
    return requestData<Schemas['CorrectionRequestListEnvelope']['data']>('/donors/me/correction-requests')
      .then((data) => data.items);
  },

  createDonorCorrectionRequest(input: CreateCorrectionRequestInput): Promise<DonorCorrectionRequest> {
    return mutate<DonorCorrectionRequest>('/donors/me/correction-requests', 'POST', input);
  },

  getDonorCorrectionRequest(requestId: string): Promise<DonorCorrectionRequest> {
    return requestData<DonorCorrectionRequest>(
      `/donors/me/correction-requests/${encodeURIComponent(requestId)}`,
    );
  },

  changeInvitationResponse(
    invitationId: string,
    response: 'confirmada' | 'rechazada',
  ): Promise<Schemas['InvitationResponseEnvelope']['data']> {
    return mutate<Schemas['InvitationResponseEnvelope']['data']>(
      `/donors/me/invitations/${encodeURIComponent(invitationId)}/response`,
      'PATCH',
      { response },
    );
  },

  getHospitalNeeds(): Promise<Need[]> {
    return requestData<Schemas['NeedListEnvelope']['data']>('/hospitals/me/needs')
      .then((data) => data.items);
  },

  createHospitalNeed(input: CreateNeedInput): Promise<Need> {
    return mutate<Need>('/hospitals/me/needs', 'POST', input);
  },

  getHospitalInvitationBatches(needId: string, query: BatchPageQuery = {}): Promise<InvitationBatchPage> {
    const parameters = new URLSearchParams();
    if (query.limit !== undefined) parameters.set('limit', String(query.limit));
    if (query.cursor !== undefined) parameters.set('cursor', query.cursor);
    const search = parameters.size ? `?${parameters}` : '';
    return requestData<InvitationBatchPage>(
      `/hospitals/me/needs/${encodeURIComponent(needId)}/invitation-batches${search}`,
    );
  },

  requestHospitalInvitationBatch(needId: string): Promise<Schemas['InvitationBatchEnvelope']['data']> {
    return mutate<Schemas['InvitationBatchEnvelope']['data']>(
      `/hospitals/me/needs/${encodeURIComponent(needId)}/invitation-batches`,
      'POST',
    );
  },

  getHospitalNeedResponses(needId: string): Promise<{
    confirmedIntentCount: number;
    items: NeedResponse[];
  }> {
    return requestData<Schemas['HospitalResponsesEnvelope']['data']>(
      `/hospitals/me/needs/${encodeURIComponent(needId)}/responses`,
    ).then((data) => ({
      confirmedIntentCount: data.confirmedIntentCount,
      items: data.items,
    }));
  },

  getSuperadminTasks(): Promise<SuperadminTask[]> {
    return requestData<Schemas['SuperadminTasksEnvelope']['data']>('/superadmin/task-queue')
      .then((data) => data.items);
  },

  getHospitals(): Promise<HospitalRecord[]> {
    return requestData<Schemas['HospitalListEnvelope']['data']>('/superadmin/hospitals')
      .then((data) => data.items);
  },

  getAuditEvents(): Promise<AuditEvent[]> {
    return requestData<Schemas['AuditEventListEnvelope']['data']>('/superadmin/audit-events')
      .then((data) => data.items);
  },

  getConfiguration(): Promise<Schemas['ConfigurationEnvelope']['data']> {
    return requestData<Schemas['ConfigurationEnvelope']['data']>('/superadmin/configuration');
  },
};
