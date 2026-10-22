import { describe, expect, it } from 'vitest';
import { createCsrfToken, verifyCsrfToken } from './csrf.js';

const SECRET = 's'.repeat(40);
const SESSION = 'sesion-de-prueba-0001';

describe('CSRF firmado ligado a la sesión', () => {
  it('acepta el token emitido para la misma sesión y secreto', () => {
    const token = createCsrfToken(SECRET, SESSION);

    expect(verifyCsrfToken(SECRET, SESSION, token)).toBe(true);
  });

  it('emite un token distinto en cada llamada', () => {
    expect(createCsrfToken(SECRET, SESSION)).not.toBe(createCsrfToken(SECRET, SESSION));
  });

  it('rechaza el token de otra sesión', () => {
    const token = createCsrfToken(SECRET, SESSION);

    expect(verifyCsrfToken(SECRET, 'otra-sesion-0002', token)).toBe(false);
  });

  it('rechaza un token firmado con otro secreto', () => {
    const token = createCsrfToken(SECRET, SESSION);

    expect(verifyCsrfToken('x'.repeat(40), SESSION, token)).toBe(false);
  });

  it('rechaza tokens alterados o mal formados', () => {
    const [nonce, mac] = createCsrfToken(SECRET, SESSION).split('.');
    const flipped = mac.replace(/^./, (char) => (char === 'a' ? 'b' : 'a'));

    expect(verifyCsrfToken(SECRET, SESSION, `${nonce}.${flipped}`)).toBe(false);
    expect(verifyCsrfToken(SECRET, SESSION, nonce)).toBe(false);
    expect(verifyCsrfToken(SECRET, SESSION, `${nonce}.${mac}.extra`)).toBe(false);
    expect(verifyCsrfToken(SECRET, SESSION, '')).toBe(false);
  });

  it('no acepta una sesión vacía', () => {
    expect(verifyCsrfToken(SECRET, '', createCsrfToken(SECRET, ''))).toBe(false);
  });
});

describe('verifyCsrfToken con entradas no string', () => {
  it('devuelve false en vez de lanzar si falta la cabecera', () => {
    expect(verifyCsrfToken('s'.repeat(40), 'sesion-1', undefined)).toBe(false);
    expect(verifyCsrfToken('s'.repeat(40), 'sesion-1', 42)).toBe(false);
  });
});
