import { randomBytes } from 'node:crypto';
import { hmacSha256Hex } from './hmac.js';
import { safeEqual } from './tokens.js';

const NONCE_BYTES = 32;

/** JSON.stringify evita ambigüedad entre sesión y nonce con separadores dentro de los valores. */
function macFor(secret: string, sessionId: string, nonce: string): string {
  return hmacSha256Hex(secret, JSON.stringify([sessionId, nonce]));
}

/** Formato: `<nonce>.<hmac>`. El HMAC liga el token a la sesión (claim session_id). */
export function createCsrfToken(secret: string, sessionId: string): string {
  const nonce = randomBytes(NONCE_BYTES).toString('base64url');
  return `${nonce}.${macFor(secret, sessionId, nonce)}`;
}

export function verifyCsrfToken(secret: string, sessionId: string, token: unknown): boolean {
  if (sessionId === '' || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return false;
  const [nonce, mac] = parts;
  return safeEqual(mac, macFor(secret, sessionId, nonce));
}
