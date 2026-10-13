import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type SvixHeaders = Readonly<{ id: string | undefined; timestamp: string | undefined; signature: string | undefined }>;

/** `base64(HMAC-SHA256(secret, "<svix-id>.<svix-timestamp>.<cuerpo crudo>"))`. */
export function signWebhook(secret: Buffer, id: string, timestamp: string, rawBody: Buffer | string): string {
  return createHmac('sha256', secret).update(`${id}.${timestamp}.`).update(rawBody).digest('base64');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifica una firma estilo Svix sobre el cuerpo CRUDO. `svix-signature` es una lista separada por espacios
 * de `v1,<base64>`; basta con que una coincida. Rechaza una marca de tiempo fuera de ±300 s (pasada o futura)
 * o con formato inválido. La comparación es en tiempo constante y no distingue el motivo del rechazo.
 */
export function verifyWebhook(secret: Buffer, headers: SvixHeaders, rawBody: Buffer, nowSeconds: number): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^[0-9]{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = signWebhook(secret, id, timestamp, rawBody);
  let matched = false;
  for (const candidate of signature.split(' ')) {
    const [version, value] = candidate.split(',');
    // Se recorren todas para no revelar por tiempo cuál coincidió.
    if (version === 'v1' && value !== undefined && safeEqual(value, expected)) matched = true;
  }
  return matched;
}

/** Eventos del proveedor que avanzan el estado de entrega; el resto se ignora. */
export const EVENT_TO_DELIVERY = Object.freeze({
  'email.sent': 'enviada',
  'email.delivered': 'entregada',
  'email.bounced': 'fallida',
  'email.failed': 'fallida',
} as const);
