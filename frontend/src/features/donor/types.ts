import type { BloodType } from '../../lib/format.js';

// Tipos con la forma del contrato (docs/openapi.json). Se reemplazan por los
// tipos generados en el slice del cliente HTTP.
export type InvitationResponse = 'sin_respuesta' | 'confirmada' | 'rechazada';

export type DonorInvitation = {
  invitationId: string;
  hospitalName: string;
  publicSiteName: string;
  requiredBloodType: BloodType;
  urgency: 'Normal' | 'Urgente' | 'Critica';
  instructions: string;
  expiresAt: string;
  validity: 'activa' | 'invalidada' | 'vencida';
  delivery: 'pendiente' | 'enviada' | 'entregada' | 'fallida';
  response: InvitationResponse;
};

export type ResponseHistoryItem = {
  invitationId: string;
  response: 'confirmada' | 'rechazada';
  changedAt: string;
};

export type DonorProfile = {
  name: string;
  email: string;
  declaredBloodType: BloodType;
  isAvailable: boolean;
  approximateLocation: { latitude: number; longitude: number };
};

export type CorrectionRequest = {
  requestId: string;
  type: 'correccion' | 'eliminacion';
  requestedFields: Array<'name' | 'email' | 'declaredBloodType' | 'deletion'>;
  status: 'pendiente' | 'aprobada' | 'rechazada' | 'en_ejecucion' | 'completada' | 'fallida';
  createdAt: string;
  updatedAt: string;
  decisionReason?: string;
};
