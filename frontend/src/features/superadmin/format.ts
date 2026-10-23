import type { RequestStatus } from './types.js';
export { formatDateTime as formatLima } from '../../lib/format.js';
export const requestFieldLabels = { name: 'Nombre', email: 'Correo', declaredBloodType: 'Grupo declarado', deletion: 'Eliminación de cuenta' };
export const requestStatusLabels: Record<RequestStatus, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', en_ejecucion: 'En ejecución', completada: 'Completada', fallida: 'Fallida' };
/** datetime-local se interpreta en Lima, independientemente de la zona del navegador. */
export function limaInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value + ':00-05:00');
  if (!Number.isFinite(date.valueOf())) return null;
  const roundTrip = new Date(date.valueOf() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return roundTrip === value ? date.toISOString() : null;
}

