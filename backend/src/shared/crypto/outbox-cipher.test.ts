import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openPayload, type OutboxKeyring, SealedPayloadError, sealPayload } from './outbox-cipher.js';

function keyringOf(currentKid: string, entries: Record<string, Buffer>): OutboxKeyring {
  return { currentKid, keys: new Map(Object.entries(entries)) };
}

const K1 = randomBytes(32);
const K2 = randomBytes(32);
const KEYRING = keyringOf('k1', { k1: K1 });
const CONTEXT = 'outbox:0f8fad5b-d9cb-469f-a165-000000000001';
const PLAINTEXT = JSON.stringify({ to: 'destino.canario@example.test', subject: 'Invitación canario' });

describe('cifrado AES-256-GCM del outbox', () => {
  it('recupera el payload original con el mismo contexto y clave', () => {
    const sealed = sealPayload(KEYRING, PLAINTEXT, CONTEXT);

    expect(openPayload(KEYRING, sealed, CONTEXT)).toBe(PLAINTEXT);
  });

  it('incluye el kid de la clave actual en el formato v1.<kid>.<iv>.<tag>.<ct>', () => {
    const parts = sealPayload(KEYRING, PLAINTEXT, CONTEXT).split('.');

    expect(parts).toHaveLength(5);
    expect(parts.slice(0, 2)).toEqual(['v1', 'k1']);
  });

  it('no deja el texto en claro en el valor cifrado', () => {
    const sealed = sealPayload(KEYRING, PLAINTEXT, CONTEXT);

    expect(sealed).not.toContain('destino.canario');
    expect(sealed).not.toContain('Invitación');
  });

  it('usa un IV aleatorio, así que el mismo texto cifra distinto', () => {
    expect(sealPayload(KEYRING, PLAINTEXT, CONTEXT)).not.toBe(sealPayload(KEYRING, PLAINTEXT, CONTEXT));
  });

  it('rechaza el payload si el contexto autenticado no coincide', () => {
    const sealed = sealPayload(KEYRING, PLAINTEXT, CONTEXT);

    expect(() => openPayload(KEYRING, sealed, 'outbox:otro-registro')).toThrow(SealedPayloadError);
  });

  it('rechaza el payload si el kid apunta a otra clave', () => {
    const sealed = sealPayload(KEYRING, PLAINTEXT, CONTEXT);
    const other = keyringOf('k1', { k1: randomBytes(32) });

    expect(() => openPayload(other, sealed, CONTEXT)).toThrow(SealedPayloadError);
  });

  it('abre un payload antiguo después de rotar la clave actual', () => {
    const sealedWithK1 = sealPayload(KEYRING, PLAINTEXT, CONTEXT);
    const rotated = keyringOf('k2', { k1: K1, k2: K2 });

    expect(openPayload(rotated, sealedWithK1, CONTEXT)).toBe(PLAINTEXT);
    expect(sealPayload(rotated, PLAINTEXT, CONTEXT).split('.')[1]).toBe('k2');
  });

  it('rechaza un kid desconocido con el error genérico', () => {
    const sealed = sealPayload(keyringOf('k9', { k9: K2 }), PLAINTEXT, CONTEXT);

    expect(() => openPayload(KEYRING, sealed, CONTEXT)).toThrow(SealedPayloadError);
  });

  it('rechaza el payload alterado o con formato inválido', () => {
    const [version, kid, iv, tag, ciphertext] = sealPayload(KEYRING, PLAINTEXT, CONTEXT).split('.');
    const flipped = ciphertext.replace(/^./, (char) => (char === 'A' ? 'B' : 'A'));

    expect(() => openPayload(KEYRING, [version, kid, iv, tag, flipped].join('.'), CONTEXT)).toThrow(SealedPayloadError);
    expect(() => openPayload(KEYRING, 'v9.k1.x.y.z', CONTEXT)).toThrow(SealedPayloadError);
    expect(() => openPayload(KEYRING, 'v1.x.y.z', CONTEXT)).toThrow(SealedPayloadError);
    expect(() => openPayload(KEYRING, 'no-es-un-payload', CONTEXT)).toThrow(SealedPayloadError);
  });

  it('exige claves de exactamente 32 bytes y una clave actual presente', () => {
    expect(() => sealPayload(keyringOf('k1', { k1: randomBytes(16) }), PLAINTEXT, CONTEXT)).toThrow('Clave de cifrado inválida.');
    expect(() => sealPayload(keyringOf('k2', { k1: K1 }), PLAINTEXT, CONTEXT)).toThrow('Clave de cifrado inválida.');
  });
});
