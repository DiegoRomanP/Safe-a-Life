import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Mensaje genérico: no revela si falló la clave, el contexto o el formato. */
export class SealedPayloadError extends Error {
  constructor() {
    super('El payload cifrado no es válido.');
    this.name = 'SealedPayloadError';
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) throw new Error('Clave de cifrado inválida.');
}

/**
 * Cifra con AES-256-GCM y un IV aleatorio. `context` se autentica como AAD (por
 * ejemplo, el id del registro del outbox), así que un payload no sirve en otro
 * registro. Formato: `v1.<iv>.<tag>.<ciphertext>` en base64url.
 */
export function sealPayload(key: Buffer, plaintext: string, context: string): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function openPayload(key: Buffer, sealed: string, context: string): string {
  assertKey(key);
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SealedPayloadError();

  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SealedPayloadError();

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SealedPayloadError();
  }
}
