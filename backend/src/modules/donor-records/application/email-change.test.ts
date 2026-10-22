import { describe, expect, it } from 'vitest';
import { SealedPayloadError } from '../../../shared/crypto/outbox-cipher.js';
import { openEmailChange, sealEmailChange } from './email-change.js';

const keyring = Object.freeze({ currentKid: 'k1', keys: new Map([['k1', Buffer.alloc(32, 7)]]) });
const HASH = 'a'.repeat(64);

describe('cambio de correo sellado', () => {
  it('el correo nuevo se abre solo con el hash del token con el que se selló', () => {
    const sealed = sealEmailChange(keyring, HASH, 'nuevo@example.test');

    expect(sealed).not.toContain('nuevo@example.test');
    expect(openEmailChange(keyring, HASH, sealed)).toBe('nuevo@example.test');
    expect(() => openEmailChange(keyring, 'b'.repeat(64), sealed)).toThrow(SealedPayloadError);
  });

  it('no sella ni abre algo que no es un correo', () => {
    expect(() => sealEmailChange(keyring, HASH, 'no-es-correo')).toThrow(TypeError);
  });
});
