import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Token de acción de 256 bits (CSPRNG). Se entrega al usuario y nunca se guarda en claro. */
export function generateActionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hash que sí se guarda en la base de datos para comparar tokens de un solo uso. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparación en tiempo constante. Las longitudes distintas se rechazan sin comparar contenido. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
