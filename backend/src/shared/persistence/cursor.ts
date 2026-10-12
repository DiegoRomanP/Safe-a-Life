import { hmacSha256Hex } from '../crypto/hmac.js';
import { safeEqual } from '../crypto/tokens.js';
import { ApiError } from '../http/errors.js';

export const MAX_CURSOR_LENGTH = 512;

export interface CursorPosition {
  readonly createdAt: string;
  readonly id: string;
}

const POSITION_FIELD = /^[A-Za-z0-9:.\-+TZ]{1,64}$/;

function sign(secret: string, scope: string, body: string): string {
  return hmacSha256Hex(secret, JSON.stringify([scope, body]));
}

/**
 * Cursor opaco: base64url(JSON) + HMAC ligado al ámbito (actor/hospital y
 * operación). No contiene PII: solo la posición (fecha e id) del último ítem.
 */
export function encodeCursor(scope: string, position: CursorPosition, secret: string): string {
  const body = Buffer.from(JSON.stringify([position.createdAt, position.id]), 'utf8').toString('base64url');
  return `${body}.${sign(secret, scope, body)}`;
}

/** Cualquier cursor manipulado, de otro ámbito o demasiado largo se rechaza con 400. */
export function decodeCursor(scope: string, cursor: string, secret: string): CursorPosition {
  const fail = (): never => {
    throw new ApiError('BAD_REQUEST');
  };
  if (cursor.length > MAX_CURSOR_LENGTH) return fail();
  const parts = cursor.split('.');
  if (parts.length !== 2) return fail();
  const [body, mac] = parts;
  if (!safeEqual(mac, sign(secret, scope, body))) return fail();

  try {
    const decoded: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2) return fail();
    const [createdAt, id] = decoded as unknown[];
    if (typeof createdAt !== 'string' || typeof id !== 'string' || !POSITION_FIELD.test(createdAt) || !POSITION_FIELD.test(id)) {
      return fail();
    }
    return Object.freeze({ createdAt, id });
  } catch {
    return fail();
  }
}
