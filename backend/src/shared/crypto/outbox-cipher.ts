import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KID_PATTERN = /^[a-z0-9]{1,16}$/;

/** Claves por identificador (`kid`) para poder rotar sin perder los payloads pendientes. */
export type OutboxKeyring = Readonly<{ currentKid: string; keys: ReadonlyMap<string, Buffer> }>;

/** Mensaje genérico: no revela si falló la clave, el contexto o el formato. */
export class SealedPayloadError extends Error {
  constructor() {
    super('El payload cifrado no es válido.');
    this.name = 'SealedPayloadError';
  }
}

export function isValidKid(kid: string): boolean {
  return KID_PATTERN.test(kid);
}

function assertKey(key: Buffer | undefined): asserts key is Buffer {
  if (key === undefined || key.length !== KEY_BYTES) throw new Error('Clave de cifrado inválida.');
}

/**
 * Cifra con AES-256-GCM y la clave actual del keyring, con un IV aleatorio.
 * `context` se autentica como AAD (por ejemplo, el id del registro del outbox),
 * así que un payload no sirve en otro registro.
 * Formato: `v1.<kid>.<iv>.<tag>.<ciphertext>` (iv, tag y ciphertext en base64url).
 */
export function sealPayload(keyring: OutboxKeyring, plaintext: string, context: string): string {
  const key = keyring.keys.get(keyring.currentKid);
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, keyring.currentKid, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function openPayload(keyring: OutboxKeyring, sealed: string, context: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) throw new SealedPayloadError();

  const key = keyring.keys.get(parts[1]);
  if (key === undefined) throw new SealedPayloadError();
  assertKey(key);

  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const ciphertext = Buffer.from(parts[4], 'base64url');
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
