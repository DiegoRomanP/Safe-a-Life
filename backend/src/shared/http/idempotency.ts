import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ApiError } from './errors.js';
import { parseIdempotencyKey } from './idempotency-key.js';

/** La clave es obligatoria en toda mutación (16–255 code points); su valor nunca se registra. */
export function requireIdempotencyKey(req: Request): string {
  const key = parseIdempotencyKey(req.get('idempotency-key'));
  if (key === undefined) throw new ApiError('BAD_REQUEST');
  return key;
}

/**
 * SHA-256 hexadecimal de un JSON compacto de pares [campo, valor] en el orden
 * dado. Generaliza `fingerprintNeedDraftInput` (spec A2 §4): el orden forma
 * parte del contrato porque la RPC recalcula el mismo hash en SQL.
 */
export function fingerprint(fields: readonly (readonly [string, unknown])[]): string {
  const entries = fields.map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`);
  return createHash('sha256').update(`{${entries.join(',')}}`, 'utf8').digest('hex');
}
