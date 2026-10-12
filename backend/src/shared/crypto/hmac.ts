import { createHmac } from 'node:crypto';

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

/**
 * Identificador determinista de un correo para contadores y auditoría sin PII.
 * Normaliza antes de firmar para que mayúsculas o espacios no cambien el sujeto.
 */
export function hmacEmailSubject(secret: string, email: string): string {
  return hmacSha256Hex(secret, email.trim().toLowerCase());
}

/**
 * Clave derivada por propósito (`email`, `ip`, `mfa`, `idempotency`): una filtración o un oráculo
 * sobre un uso no sirve para los demás. Nunca se reutiliza el secreto crudo entre usos.
 */
export function deriveHmacKey(secret: string, purpose: string): string {
  return hmacSha256Hex(secret, `purpose:${purpose}`);
}
