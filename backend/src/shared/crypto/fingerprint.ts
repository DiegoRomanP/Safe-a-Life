import { createHash } from 'node:crypto';

/**
 * SHA-256 hexadecimal de un JSON compacto de pares [campo, valor] en el orden dado. El orden forma
 * parte del contrato porque la RPC recalcula el mismo hash en SQL (`app.fingerprint`).
 */
export function fingerprint(fields: readonly (readonly [string, unknown])[]): string {
  const entries = fields.map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`);
  return createHash('sha256').update(`{${entries.join(',')}}`, 'utf8').digest('hex');
}
