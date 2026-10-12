import { describe, expect, it } from 'vitest';
import { secretFromOtpauthUri, totpCode } from './totp.js';

// Vectores de RFC 6238 (SHA-1, secreto ASCII "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totpCode', () => {
  it('coincide con los vectores de prueba de RFC 6238 (6 dígitos)', () => {
    expect(totpCode(SECRET, 59_000)).toBe('287082');
    expect(totpCode(SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(SECRET, 1_234_567_890_000)).toBe('005924');
  });

  it('extrae el secreto de un URI otpauth', () => {
    expect(secretFromOtpauthUri(`otpauth://totp/Save%20a%20Life:a@example.test?secret=${SECRET}&issuer=Save`)).toBe(SECRET);
    expect(() => secretFromOtpauthUri('otpauth://totp/x')).toThrow();
  });
});
