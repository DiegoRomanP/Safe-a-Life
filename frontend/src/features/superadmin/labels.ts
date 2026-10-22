import type { Tone } from '../../components/ui/tones.js';
import type { AdminCorrectionRequest, AuditEvent, Membership, SuperadminTask } from './types.js';

// Etiquetas visibles de los valores del contrato; el color siempre va con texto.
export const taskKindLabel: Record<SuperadminTask['kind'], string> = {
  correction_request: 'Solicitud de corrección o eliminación',
  hospital_review: 'Revisión de sede u hospital',
  recognition_policy: 'Política de reconocimiento',
  delivery_failure: 'Fallo de entrega',
};

export const membershipStatusLabel: Record<Membership['status'], { label: string; tone: Tone }> = {
  pendiente: { label: 'Invitado', tone: 'warning' },
  activa: { label: 'Activo', tone: 'success' },
  revocada: { label: 'Revocado', tone: 'neutral' },
};

export const requestStatusLabel: Record<AdminCorrectionRequest['status'], { label: string; tone: Tone }> = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aprobada: { label: 'Aprobada', tone: 'info' },
  rechazada: { label: 'Rechazada', tone: 'neutral' },
  en_ejecucion: { label: 'En ejecución', tone: 'info' },
  completada: { label: 'Completada', tone: 'success' },
  fallida: { label: 'Fallida', tone: 'danger' },
};

export const auditResultLabel: Record<AuditEvent['result'], string> = {
  ok: 'Correcto',
  denegado: 'Denegado',
  fallido: 'Fallido',
};

const fieldLabel = { name: 'nombre', email: 'correo', declaredBloodType: 'grupo declarado', deletion: 'datos' } as const;

/** «Corrección de grupo declarado», «Eliminación de datos». */
export function requestTitle(request: AdminCorrectionRequest): string {
  if (request.type === 'eliminacion') return 'Eliminación de datos';
  return `Corrección de ${request.requestedFields.map((field) => fieldLabel[field]).join(' y ')}`;
}

/** Código visible a partir del identificador: «SOL-7F21». */
export const requestCode = (requestId: string) => `SOL-${requestId.slice(0, 4).toUpperCase()}`;
