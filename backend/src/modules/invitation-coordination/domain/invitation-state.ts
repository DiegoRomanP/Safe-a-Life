/** Tres ejes independientes de una invitación (Anexo B.5). Puro. */
export type Validity = 'activa' | 'invalidada' | 'vencida';
export type Delivery = 'pendiente' | 'enviada' | 'entregada' | 'fallida';
export type Response = 'sin_respuesta' | 'confirmada' | 'rechazada';

const VALIDITY: Readonly<Record<Validity, readonly Validity[]>> = { activa: ['invalidada', 'vencida'], invalidada: [], vencida: [] };
/** `fallida → pendiente` solo por reintento manual auditado, con tokens nuevos. */
const DELIVERY: Readonly<Record<Delivery, readonly Delivery[]>> = {
  pendiente: ['enviada', 'fallida'], enviada: ['entregada', 'fallida'], entregada: [], fallida: ['pendiente'],
};
/** `confirmada ↔ rechazada` solo con sesión y necesidad no terminal; lo comprueba la RPC. */
const RESPONSE: Readonly<Record<Response, readonly Response[]>> = {
  sin_respuesta: ['confirmada', 'rechazada'], confirmada: ['rechazada'], rechazada: ['confirmada'],
};

export const canTransitionValidity = (from: Validity, to: Validity): boolean => VALIDITY[from].includes(to);
export const canTransitionDelivery = (from: Delivery, to: Delivery): boolean => DELIVERY[from].includes(to);
export const canTransitionResponse = (from: Response, to: Response): boolean => RESPONSE[from].includes(to);
