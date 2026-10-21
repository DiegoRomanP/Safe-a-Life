import { describe, expect, it } from 'vitest';
import { parseIdempotencyKey } from './idempotency-key.js';

describe('parseIdempotencyKey', () => {
  it('acepta claves de 16 a 255 caracteres', () => {
    expect(parseIdempotencyKey('a'.repeat(16))).toBe('a'.repeat(16));
    expect(parseIdempotencyKey('b'.repeat(255))).toBe('b'.repeat(255));
  });

  it('rechaza claves de 15 o 256 caracteres', () => {
    expect(parseIdempotencyKey('a'.repeat(15))).toBeUndefined();
    expect(parseIdempotencyKey('a'.repeat(256))).toBeUndefined();
  });

  it('mide en code points, no en unidades UTF-16', () => {
    const sixteenEmojis = '😀'.repeat(16);
    const fifteenEmojis = '😀'.repeat(15);

    expect(sixteenEmojis.length).toBe(32);
    expect(parseIdempotencyKey(sixteenEmojis)).toBe(sixteenEmojis);
    expect(parseIdempotencyKey(fifteenEmojis)).toBeUndefined();
  });

  it('rechaza valores que no son cadenas simples', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey(['a'.repeat(20), 'b'.repeat(20)])).toBeUndefined();
    expect(parseIdempotencyKey(Number.MAX_SAFE_INTEGER)).toBeUndefined();
  });
});
