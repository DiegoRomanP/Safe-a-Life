import { describe, expect, it } from 'vitest';
import { BACKOFF_MINUTES, MAX_CALLS, classify, nextDelayMs } from './retry-policy.js';

describe('política de reintentos (V7 / RF-EML-02)', () => {
  it('permite 6 llamadas en total con retardos base de 1, 2, 5, 10 y 20 minutos', () => {
    expect(MAX_CALLS).toBe(6);
    expect(BACKOFF_MINUTES).toEqual([1, 2, 5, 10, 20]);
  });

  it('con random 0.5 el retardo es el base; con 0 y 1 queda en ±20 %', () => {
    expect(nextDelayMs(1, 0.5)).toBe(60_000);
    expect(nextDelayMs(1, 0)).toBe(48_000);
    expect(nextDelayMs(1, 1)).toBe(72_000);
    expect(nextDelayMs(5, 0)).toBe(20 * 60_000 * 0.8);
    expect(nextDelayMs(5, 1)).toBe(20 * 60_000 * 1.2);
  });

  it('cada llamada previa usa su retardo base', () => {
    expect([1, 2, 3, 4, 5].map((calls) => nextDelayMs(calls, 0.5))).toEqual([60_000, 120_000, 300_000, 600_000, 1_200_000]);
  });

  it('tras la sexta llamada no hay más retardo (null)', () => {
    expect(nextDelayMs(6, 0.5)).toBeNull();
    expect(nextDelayMs(7, 0.5)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])('un número de llamadas inválido (%s) no produce retardo', (calls) => {
    expect(nextDelayMs(calls, 0.5)).toBeNull();
  });

  it.each([-0.1, 1.1, Number.NaN])('un random fuera de [0, 1] (%s) se rechaza', (random) => {
    expect(() => nextDelayMs(1, random)).toThrow(RangeError);
  });
});

describe('clasificación del resultado de una llamada', () => {
  it('2xx es ok', () => {
    expect(classify({ type: 'response', status: 200 })).toBe('ok');
    expect(classify({ type: 'response', status: 202 })).toBe('ok');
  });

  it.each([408, 429, 500, 502, 503, 504])('el estado %s es transitorio', (status) => {
    expect(classify({ type: 'response', status })).toBe('transitorio');
  });

  it.each([400, 401, 403, 404, 409, 422])('el estado %s es permanente', (status) => {
    expect(classify({ type: 'response', status })).toBe('permanente');
  });

  it('un error de red o un timeout antes de enviar el body es transitorio', () => {
    expect(classify({ type: 'network', bodySent: false })).toBe('transitorio');
    expect(classify({ type: 'timeout', bodySent: false })).toBe('transitorio');
  });

  it('un timeout o un corte después de enviar el body es incierto', () => {
    expect(classify({ type: 'timeout', bodySent: true })).toBe('incierto');
    expect(classify({ type: 'network', bodySent: true })).toBe('incierto');
  });

  it('un estado inesperado (1xx, 3xx) es transitorio, nunca ok', () => {
    expect(classify({ type: 'response', status: 100 })).toBe('transitorio');
    expect(classify({ type: 'response', status: 302 })).toBe('transitorio');
  });
});
