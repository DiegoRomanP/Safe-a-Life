/** Estado agregado de entrega de una invitación (V5 / AP-02). Puro. */
export const DELIVERY_STATES = ['pendiente', 'enviada', 'entregada', 'fallida'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export type DeliveryEvent = Exclude<DeliveryState, 'pendiente'>;

const RANK: Readonly<Record<'pendiente' | 'enviada' | 'entregada', number>> = Object.freeze({ pendiente: 0, enviada: 1, entregada: 2 });

/**
 * Nunca retrocede. `fallida` es final (solo el reintento manual la reinicia, fuera de esta función);
 * un rebote posterior a la entrega no la invalida. La RPC `ingest_email_event` aplica la misma regla en SQL.
 */
export function advance(current: DeliveryState, event: DeliveryEvent): DeliveryState {
  if (current === 'fallida') return 'fallida';
  if (event === 'fallida') return current === 'entregada' ? 'entregada' : 'fallida';
  return RANK[event] > RANK[current] ? event : current;
}
