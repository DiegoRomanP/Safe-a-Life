import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, expiredCookie, parseCookies, serializeCookie, sessionCookie } from './cookies.js';

describe('parseCookies', () => {
  it('toma la primera ocurrencia y descarta nombres o valores inválidos', () => {
    const cookies = parseCookies('a=1; a=2; b c=3; d="x"; e=y;z; __Host-sal_at=h.p.s');

    expect(cookies.a).toBe('1');
    expect(cookies['b c']).toBeUndefined();
    expect(cookies.d).toBeUndefined();
    expect(cookies[ACCESS_COOKIE]).toBe('h.p.s');
  });

  it('devuelve un objeto sin prototipo y tolera cabeceras ausentes', () => {
    expect(Object.keys(parseCookies(undefined))).toEqual([]);
    expect(parseCookies('__proto__=x').__proto__).toBe('x');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('serializeCookie', () => {
  it('emite los atributos de sesión de ADR-004', () => {
    expect(sessionCookie(ACCESS_COOKIE, 'h.p.s', 600)).toBe(
      '__Host-sal_at=h.p.s; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(expiredCookie(ACCESS_COOKIE)).toContain('Max-Age=0');
  });

  it('rechaza valores con inyección de atributos y __Host- sin Secure o con otra ruta', () => {
    const base = { maxAge: 1, httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

    expect(() => serializeCookie('a', 'x; Domain=evil.test', base)).toThrow('Cookie inválida.');
    expect(() => serializeCookie('a', 'x\r\nSet-Cookie: y=1', base)).toThrow('Cookie inválida.');
    expect(() => serializeCookie('__Host-a', 'x', { ...base, secure: false })).toThrow('Cookie inválida.');
    expect(() => serializeCookie('__Host-a', 'x', { ...base, path: '/api' })).toThrow('Cookie inválida.');
    expect(() => serializeCookie('a', 'x', { ...base, maxAge: -1 })).toThrow('Cookie inválida.');
  });
});
