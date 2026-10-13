import { openPayload, sealPayload, type OutboxKeyring } from '../../../shared/crypto/outbox-cipher.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

/**
 * Correo nuevo de un cambio de correo, cifrado dentro del token (`action_tokens.data.sealedEmail`). El contexto autenticado
 * es el hash del token: el valor no sirve en otro token. Quien solicita el cambio (F7) lo sella; verificarlo lo abre.
 */
export function sealEmailChange(keyring: OutboxKeyring, tokenHash: string, newEmail: string): string {
  if (!EMAIL.test(newEmail)) throw new TypeError('newEmail');
  return sealPayload(keyring, newEmail, tokenHash);
}

/** Abre el correo nuevo; lanza si el cifrado, el contexto o la forma del correo no son válidos. */
export function openEmailChange(keyring: OutboxKeyring, tokenHash: string, sealed: string): string {
  const email = openPayload(keyring, sealed, tokenHash);
  if (!EMAIL.test(email)) throw new TypeError('newEmail');
  return email;
}
