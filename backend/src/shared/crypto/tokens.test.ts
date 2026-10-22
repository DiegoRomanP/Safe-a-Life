import { describe, expect, it } from 'vitest';
import { generateActionToken, hashToken, safeEqual } from './tokens.js';

describe('generateActionToken', () => {
  it('genera 256 bits en base64url sin relleno', () => {
    const token = generateActionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('no repite tokens entre llamadas', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateActionToken()));

    expect(tokens.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('guarda el SHA-256 hexadecimal del token', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('no devuelve el token en claro', () => {
    const token = generateActionToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('safeEqual', () => {
  it('compara cadenas de igual contenido', () => {
    expect(safeEqual('mismo-valor', 'mismo-valor')).toBe(true);
  });

  it('rechaza cadenas distintas o de longitud distinta', () => {
    expect(safeEqual('valor-a', 'valor-b')).toBe(false);
    expect(safeEqual('corto', 'mucho-mas-largo')).toBe(false);
  });
});
