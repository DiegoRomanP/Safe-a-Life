import type { Page, PageQuery } from '../../../shared/persistence/page.js';
import type { NeedBloodType, NeedUrgency } from '../../need-records/domain/need-draft.js';
import type { NeedStatus } from '../../need-records/domain/need-state.js';

export type { Page, PageQuery };

/** Clave de idempotencia y hash canónico que la RPC recalcula y compara. */
export type Envelope = Readonly<{ key: string; hash: string }>;

export type InvitationValidity = 'activa' | 'invalidada' | 'vencida';
export type InvitationDelivery = 'pendiente' | 'enviada' | 'entregada' | 'fallida';
export type InvitationResponse = 'sin_respuesta' | 'confirmada' | 'rechazada';

export type DeliveryCounts = Readonly<Record<InvitationDelivery, number>>;
export type InvitationBatchView = Readonly<{ batchId: string; createdAt: string; createdInvitationCount: number; deliveryCounts: DeliveryCounts }>;
export type BatchResult = Readonly<{ batchId: string; createdInvitationCount: number; queuedEmailCount: number }>;

/** Respuesta confirmada: el hospital ve nombre y grupo declarado; nunca correo, ubicación, distancia ni id global (RF-VIS). */
export type ConfirmedResponse = Readonly<{
  needDonorCode: string; donorName: string; declaredBloodType: NeedBloodType; response: 'confirmada'; responseRecordedAt: string;
}>;
export type OpaqueResponse = Readonly<{
  needDonorCode: string; validity: InvitationValidity; delivery: InvitationDelivery; response: 'sin_respuesta' | 'rechazada';
}>;
export type NeedResponsesPage = Page<ConfirmedResponse | OpaqueResponse> & Readonly<{ confirmedIntentCount: number }>;

/**
 * Cobertura agregada para el mapa del hospital (RF-VIS-01/02): sede, anillos por radio y celdas de al menos 3 donantes.
 * Nunca lleva ubicación, distancia, nombre ni id de una persona.
 */
/** Un grupo contiguo de anillos con al menos 3 donantes; `count: null` = hay 1 o 2 (no se revela). */
export type CoverageRing = Readonly<{ fromKm: number; toKm: number; count: number | null }>;
export type CoverageCell = Readonly<{ latitude: number; longitude: number; count: number }>;
export type NeedCoverage = Readonly<{
  site: Readonly<{ latitude: number; longitude: number }>; radiusKm: number; compatibleCount: number | null; nextBatchCount: number | null;
  rings: readonly CoverageRing[]; cells: readonly CoverageCell[];
}>;

export type ActionPreview = Readonly<{ hospitalName: string; publicSiteName: string; intendedAction: 'confirmar' | 'rechazar'; expiresAt: string }>;
export type InvitationResponseResult = Readonly<{ response: 'confirmada' | 'rechazada'; recordedAt: string; needStatus: NeedStatus }>;

export type InvitationItem = Readonly<{
  invitationId: string; hospitalName: string; publicSiteName: string; requiredBloodType: NeedBloodType; urgency: NeedUrgency;
  instructions: string; expiresAt: string; validity: InvitationValidity; delivery: InvitationDelivery; response: InvitationResponse;
}>;
export type OwnInvitationDetail = Readonly<{ invitation: InvitationItem; instructions: string }>;
export type ResponseHistoryItem = Readonly<{ invitationId: string; response: 'confirmada' | 'rechazada'; changedAt: string }>;

/** Concesión de un solo uso que el paso 1 (sesión del admin o del superadmin) entrega a la sesión técnica del paso 2. */
export type Grant = Readonly<{ grantSecret: string }>;

/** Datos que prepara la aplicación para una invitación: ids, hashes de los dos tokens y payload sellado. */
export type BatchSlot = Readonly<{ outboxId: string; invitationId: string; confirmHash: string; rejectHash: string; sealedPayload: string }>;
export type RetrySlot = Readonly<{ outboxId: string; confirmHash: string; rejectHash: string; sealedPayload: string }>;

/**
 * Puerto sobre las RPC de invitaciones. Las que recibe la persona usuaria van con su JWT; las de token y las que ejecutan el
 * segundo paso (lote, reintento) las ejecuta la sesión técnica de la API (H1).
 */
export interface InvitationsRepository {
  listBatches(accessToken: string, needId: string, query: PageQuery): Promise<Page<InvitationBatchView>>;
  /** Con la clave de idempotencia: si el lote ya se creó con ella, devuelve ese resultado en vez de una concesión. */
  authorizeBatch(accessToken: string, envelope: Envelope, needId: string): Promise<Grant | { replayed: BatchResult }>;
  listNeedResponses(accessToken: string, needId: string, query: PageQuery): Promise<NeedResponsesPage>;
  /** Solo agregados, con la sesión del admin: el hospital y el rol salen de la sesión, no de la petición. */
  getCoverage(accessToken: string, needId: string): Promise<NeedCoverage>;

  listOwn(accessToken: string, query: PageQuery): Promise<Page<InvitationItem>>;
  getOwn(accessToken: string, invitationId: string): Promise<OwnInvitationDetail>;
  changeResponse(accessToken: string, envelope: Envelope, invitationId: string, response: 'confirmada' | 'rechazada'): Promise<InvitationResponseResult>;
  listHistory(accessToken: string, query: PageQuery): Promise<Page<ResponseHistoryItem>>;

  authorizeRetry(accessToken: string, invitationId: string): Promise<Grant>;

  requestBatch(envelope: Envelope, needId: string, grant: Grant, slots: readonly BatchSlot[]): Promise<BatchResult>;
  previewAction(tokenHash: string): Promise<ActionPreview>;
  respondByToken(tokenHash: string, envelope: Envelope): Promise<InvitationResponseResult>;
  retryDelivery(envelope: Envelope, invitationId: string, grant: Grant, slot: RetrySlot): Promise<void>;
}
