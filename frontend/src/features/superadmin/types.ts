import type { BloodType } from '../../lib/format.js';

// Tipos con la forma del contrato (docs/openapi.json). Se reemplazan por los
// tipos generados en el slice del cliente HTTP.
export type SuperadminTask = {
  taskId: string;
  kind: 'correction_request' | 'hospital_review' | 'recognition_policy' | 'delivery_failure';
  createdAt: string;
  resourceCode?: string;
};

export type Hospital = {
  hospitalId: string;
  publicName: string;
  legalName?: string;
  isAuthorized: boolean;
  createdAt: string;
};

export type Site = {
  siteId: string;
  hospitalId: string;
  publicName: string;
  publicAddress?: string;
  coordinates: { latitude: number; longitude: number };
  publicInstructions?: string | null;
  isActive: boolean;
  isApproved: boolean;
};

export type Membership = {
  membershipId: string;
  hospitalId: string;
  role: 'admin_hospitalario';
  status: 'pendiente' | 'activa' | 'revocada';
  emailHint: string;
};

export type CorrectionRequestStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'en_ejecucion' | 'completada' | 'fallida';

export type AdminCorrectionRequest = {
  requestId: string;
  type: 'correccion' | 'eliminacion';
  requestedFields: Array<'name' | 'email' | 'declaredBloodType' | 'deletion'>;
  status: CorrectionRequestStatus;
  createdAt: string;
  updatedAt: string;
  decisionReason?: string;
};

export type DonorValues = { name?: string; email?: string; declaredBloodType?: BloodType };

// Respuesta de getContextualDonorData: solo los campos de la solicitud.
export type ContextualDonorData = { currentValues: DonorValues; proposedValues: DonorValues };

export type SuperadminConfiguration = { finalDemoAt: string | null; isImmutable: boolean };

export type AuditEvent = {
  eventId: string;
  actorCode: string;
  event: string;
  resourceCode: string;
  result: 'ok' | 'denegado' | 'fallido';
  occurredAt: string;
  reason?: string;
};
