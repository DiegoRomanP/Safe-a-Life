import type { BloodType } from '../../lib/format.js';

// Tipos con la forma del contrato (docs/openapi.json). Se reemplazan por los
// tipos generados en el slice del cliente HTTP.
export type NeedStatus = 'borrador' | 'activa' | 'meta_alcanzada' | 'cerrada' | 'cancelada' | 'vencida';
export type Urgency = 'Normal' | 'Urgente' | 'Critica';

export type HospitalNeed = {
  needId: string;
  component: 'RBC';
  requiredBloodType: BloodType;
  targetConfirmations: number;
  confirmedIntentCount: number;
  siteId: string;
  radiusKm: number;
  urgency: Urgency;
  status: NeedStatus;
  expiresAt: string;
};

export type HospitalSite = { siteId: string; publicName: string };

// Proyección de listOwnNeedResponses: las respuestas no afirmativas son
// opacas; solo las confirmadas incluyen nombre y grupo declarado.
export type OpaqueNeedResponse = {
  needDonorCode: string;
  validity: 'activa' | 'invalidada' | 'vencida';
  delivery: 'pendiente' | 'enviada' | 'entregada' | 'fallida';
  response: 'sin_respuesta' | 'rechazada';
};

export type ConfirmedNeedResponse = {
  needDonorCode: string;
  donorName: string;
  declaredBloodType: BloodType;
  response: 'confirmada';
  responseRecordedAt: string;
};

export type NeedResponse = OpaqueNeedResponse | ConfirmedNeedResponse;

export type NewNeed = {
  requiredBloodType: BloodType;
  targetConfirmations: number;
  siteId: string;
  radiusKm: number;
  urgency: Urgency;
  expiresInHours: number;
};

export type DeliveryCounts = { pendiente: number; enviada: number; entregada: number; fallida: number };

export type InvitationBatch = {
  batchId: string;
  createdAt: string;
  createdInvitationCount: number;
  deliveryCounts: DeliveryCounts;
};

export type AssistedSignup = {
  signupId: string;
  status: 'pendiente' | 'vencida' | 'reclamada_incompleta' | 'activa';
  createdAt: string;
  activationExpiresAt: string;
  purgeAt: string;
};

export type NeedResponses = { confirmedIntentCount: number; items: NeedResponse[] };
export type BatchRequestResult = { batchId: string; createdInvitationCount: number; queuedEmailCount: number };

/** Cobertura agregada (getNeedCoverage): nunca la ubicación, distancia, nombre o id de una persona (RF-VIS-01/02). */
/** Grupo contiguo de anillos con al menos 3 donantes (o 0); `count: null` = hay 1 o 2 y no se revela. */
export type CoverageRing = { fromKm: number; toKm: number; count: number | null };
export type CoverageCell = { latitude: number; longitude: number; count: number };
export type NeedCoverage = {
  site: { latitude: number; longitude: number };
  radiusKm: number;
  /** `null` = hay 1 o 2 (menos de 3): no se revela. */
  compatibleCount: number | null;
  nextBatchCount: number | null;
  rings: CoverageRing[];
  cells: CoverageCell[];
};
