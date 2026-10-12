import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openPayload, SealedPayloadError, sealPayload } from './outbox-cipher.js';

const KEY = randomBytes(32);
const CONTEXT = 'outbox:0f8fad5b-d9cb-469f-a165-000000000001';
const PLAINTEXT = JSON.stringify({ to: 'destino.canario@example.test', subject: 'Invitación canario' });

describe('cifrado AES-256-GCM del outbox', () => {
  it('recupera el payload original con el mismo contexto y clave', () => {
    const sealed = sealPayload(KEY, PLAINTEXT, CONTEXT);

    expect(openPayload(KEY, sealed, CONTEXT)).toBe(PLAINTEXT);
  });

  it('no deja el texto en claro en el valor cifrado', () => {
    const sealed = sealPayload(KEY, PLAINTEXT, CONTEXT);

    expect(sealed).not.toContain('destino.canario');
    expect(sealed).not.toContain('Invitación');
  });

  it('usa un IV aleatorio, así que el mismo texto cifra distinto', () => {
    expect(sealPayload(KEY, PLAINTEXT, CONTEXT)).not.toBe(sealPayload(KEY, PLAINTEXT, CONTEXT));
  });

  it('rechaza el payload si el contexto autenticado no coincide', () => {
    const sealed = sealPayload(KEY, PLAINTEXT, CONTEXT);

    expect(() => openPayload(KEY, sealed, 'outbox:otro-registro')).toThrow(SealedPayloadError);
  });

  it('rechaza el payload con otra clave', () => {
    const sealed = sealPayload(KEY, PLAINTEXT, CONTEXT);

    expect(() => openPayload(randomBytes(32), sealed, CONTEXT)).toThrow(SealedPayloadError);
  });

  it('rechaza el payload alterado o con formato inválido', () => {
    const [version, iv, tag, ciphertext] = sealPayload(KEY, PLAINTEXT, CONTEXT).split('.');
    const flipped = ciphertext.replace(/^./, (char) => (char === 'A' ? 'B' : 'A'));

    expect(() => openPayload(KEY, [version, iv, tag, flipped].join('.'), CONTEXT)).toThrow(SealedPayloadError);
    expect(() => openPayload(KEY, 'v9.x.y.z', CONTEXT)).toThrow(SealedPayloadError);
    expect(() => openPayload(KEY, 'no-es-un-payload', CONTEXT)).toThrow(SealedPayloadError);
  });

  it('exige una clave de exactamente 32 bytes', () => {
    expect(() => sealPayload(randomBytes(16), PLAINTEXT, CONTEXT)).toThrow('Clave de cifrado inválida.');
    expect(() => openPayload(randomBytes(16), 'v1.a.b.c', CONTEXT)).toThrow('Clave de cifrado inválida.');
  });
});
