import type { Tone } from '../../components/ui/tones.js';
import type { NeedResponse, NeedStatus } from './types.js';

export { urgencyLabel } from '../donor/labels.js';

// Etiquetas visibles de los valores del contrato; el color siempre va con texto.
export const needStatusLabel: Record<NeedStatus, { label: string; tone: Tone }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  activa: { label: 'Activa', tone: 'info' },
  meta_alcanzada: { label: 'Meta alcanzada', tone: 'success' },
  cerrada: { label: 'Cerrada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
  vencida: { label: 'Vencida', tone: 'warning' },
};

export const validityLabel = { activa: 'Activa', invalidada: 'Invalidada', vencida: 'Vencida' } as const;
export const deliveryLabel = { pendiente: 'Pendiente', enviada: 'Enviada', entregada: 'Entregada', fallida: 'Fallida' } as const;

export const responseLabel: Record<NeedResponse['response'], string> = {
  sin_respuesta: 'Sin respuesta',
  rechazada: 'Rechazada',
  confirmada: 'Confirmada',
};

/** Código visible a partir del identificador: «NEC-A104». */
export function needCode(needId: string): string {
  return `NEC-${needId.slice(0, 4).toUpperCase()}`;
}
