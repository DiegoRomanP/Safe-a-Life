import type { Request } from 'express';
import { ApiError } from './errors.js';
import { parseIdempotencyKey } from './idempotency-key.js';

/** La clave es obligatoria en toda mutación (16–255 code points); su valor nunca se registra. */
export function requireIdempotencyKey(req: Request): string {
  const key = parseIdempotencyKey(req.get('idempotency-key'));
  if (key === undefined) throw new ApiError('BAD_REQUEST');
  return key;
}

export { fingerprint } from '../crypto/fingerprint.js';
