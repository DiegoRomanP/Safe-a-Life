import { describe, expect, it } from 'vitest';
import { normalizeClientIp } from './client-ip.js';

describe('normalizeClientIp', () => {
  it('deja IPv4 igual y desmapea IPv4 mapeada en IPv6', () => {
    expect(normalizeClientIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeClientIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('agrupa IPv6 por prefijo /64 sin importar el sufijo ni la forma de escribirla', () => {
    const a = normalizeClientIp('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('2001:db8:abcd:12::/64');
    expect(normalizeClientIp('2001:0db8:abcd:0012::1')).toBe(a);
    expect(normalizeClientIp('2001:DB8:ABCD:12:1:2:3:4')).toBe(a);
  });

  it('expande :: dentro del prefijo y distingue prefijos distintos', () => {
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(normalizeClientIp('::1')).toBe('0:0:0:0::/64');
    expect(normalizeClientIp('2001:db8:0:1::1')).not.toBe(normalizeClientIp('2001:db8:0:2::1'));
  });

  it('usa un marcador fijo cuando no hay IP', () => {
    expect(normalizeClientIp(undefined)).toBe('desconocida');
  });
});
