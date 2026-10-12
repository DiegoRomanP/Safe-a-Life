const MIN_LENGTH = 16;
const MAX_LENGTH = 255;

/**
 * Valida la cabecera Idempotency-Key con los límites del contrato. La longitud
 * se mide en code points, igual que minLength/maxLength de JSON Schema.
 * El valor nunca se registra.
 */
export function parseIdempotencyKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const length = [...raw].length;
  return length >= MIN_LENGTH && length <= MAX_LENGTH ? raw : undefined;
}
