import { describe, expect, it } from 'vitest';
import { hmacEmailSubject, hmacSha256Hex } from './hmac.js';

const SECRET = 'e'.repeat(40);

describe('hmacSha256Hex', () => {
  it('devuelve un HMAC-SHA256 hexadecimal', () => {
    expect(hmacSha256Hex(SECRET, 'mensaje')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia con el secreto', () => {
    expect(hmacSha256Hex(SECRET, 'mensaje')).not.toBe(hmacSha256Hex('f'.repeat(40), 'mensaje'));
  });
});

describe('hmacEmailSubject', () => {
  it('normaliza mayúsculas y espacios antes de firmar', () => {
    const canonical = hmacEmailSubject(SECRET, 'persona@example.test');

    expect(hmacEmailSubject(SECRET, '  Persona@Example.TEST ')).toBe(canonical);
  });

  it('no permite recuperar el correo a partir de la firma', () => {
    const subject = hmacEmailSubject(SECRET, 'persona@example.test');

    expect(subject).not.toContain('persona');
    expect(subject).toMatch(/^[0-9a-f]{64}$/);
  });
});
