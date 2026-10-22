import type { Tone } from '../../components/ui/tones.js';
import type { CorrectionRequest, DonorInvitation, InvitationResponse } from './types.js';

// Etiquetas visibles de los valores del contrato. El color siempre va con su
// texto (Penpot: «Estados expresados con texto e iconos»).
export const urgencyLabel: Record<DonorInvitation['urgency'], { label: string; tone: Tone }> = {
  Normal: { label: 'Normal', tone: 'neutral' },
  Urgente: { label: 'Urgente', tone: 'warning' },
  Critica: { label: 'Crítica', tone: 'danger' },
};

export const responseLabel: Record<InvitationResponse, { label: string; tone: Tone }> = {
  sin_respuesta: { label: 'Sin respuesta', tone: 'neutral' },
  confirmada: { label: 'Intención confirmada', tone: 'success' },
  rechazada: { label: 'No asistiré', tone: 'info' },
};

export const historyLabel: Record<'confirmada' | 'rechazada', string> = {
  confirmada: 'Intención de asistir confirmada',
  rechazada: 'Indicaste que no podrás asistir',
};

const fieldLabel: Record<CorrectionRequest['requestedFields'][number], string> = {
  name: 'nombre',
  email: 'correo',
  declaredBloodType: 'grupo',
  deletion: 'datos',
};

/** «Corrección de grupo», «Cambio de correo», «Eliminación de datos». */
export function requestTypeLabel(request: CorrectionRequest): string {
  if (request.type === 'eliminacion') return 'Eliminación de datos';
  if (request.requestedFields.length === 1 && request.requestedFields[0] === 'email') return 'Cambio de correo';
  return `Corrección de ${request.requestedFields.map((field) => fieldLabel[field]).join(' y ')}`;
}

export const requestStatusLabel: Record<CorrectionRequest['status'], string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  en_ejecucion: 'En ejecución',
  completada: 'Completada',
  fallida: 'Fallida',
};

/** Código corto visible a partir del identificador: «SOL-7F21». */
export function requestCode(requestId: string): string {
  return `SOL-${requestId.slice(0, 4).toUpperCase()}`;
}
