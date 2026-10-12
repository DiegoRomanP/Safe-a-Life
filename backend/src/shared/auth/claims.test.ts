import { describe, expect, it } from 'vitest';
import { parseClaims } from './claims.js';

const VALID = {
  sub: '0f8fad5b-d9cb-469f-a165-70867728950e',
  session_id: 'sesion-1',
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'password', timestamp: 1 }, { method: 'totp', timestamp: 2 }],
};

describe('parseClaims', () => {
  it('extrae usuario, sesión, nivel y métodos de autenticación', () => {
    expect(parseClaims(VALID)).toEqual({
      userId: VALID.sub, sessionId: 'sesion-1', aal: 'aal2',
      amr: [{ method: 'password', timestamp: 1 }, { method: 'totp', timestamp: 2 }],
    });
  });

  it('acepta claims sin amr', () => {
    expect(parseClaims({ ...VALID, amr: undefined })?.amr).toEqual([]);
  });

  it('rechaza claims incompletos, de otro rol o con formas inesperadas', () => {
    const bad: unknown[] = [
      null, 'x', {}, { ...VALID, sub: 'no-uuid' }, { ...VALID, session_id: '' }, { ...VALID, role: 'anon' },
      { ...VALID, aal: 'aal3' }, { ...VALID, amr: 'totp' }, { ...VALID, amr: [{ method: 'totp' }] },
      { ...VALID, amr: [null] },
    ];
    for (const claims of bad) expect(parseClaims(claims)).toBeNull();
  });
});
