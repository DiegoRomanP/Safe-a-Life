import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LIMA_POLYGON } from './lima-polygon.js';
import { hasAtMostThreeDecimals, isInsideOrOnBoundary, validateApproximateLocation } from './location.js';

describe('polígono de Lima (V11)', () => {
  it('declara su versión y su SHA-256 coincide con las coordenadas serializadas', () => {
    expect(LIMA_POLYGON.version).toBe('DEMO_ONLY-1');
    expect(createHash('sha256').update(JSON.stringify(LIMA_POLYGON.coordinates)).digest('hex')).toBe(LIMA_POLYGON.sha256);
  });

  it('es un anillo cerrado y está congelado', () => {
    const ring = LIMA_POLYGON.coordinates;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(Object.isFrozen(LIMA_POLYGON)).toBe(true);
    expect(Object.isFrozen(ring)).toBe(true);
  });
});

describe('máximo tres decimales', () => {
  it.each([[-12.046, true], [-12, true], [-12.5, true], [-12.0461, false], [-12.0004, false], [0.001, true], [0.1 + 0.2, true], [0.0005, false]])(
    '%s → %s',
    (value, expected) => expect(hasAtMostThreeDecimals(value)).toBe(expected),
  );

  it('rechaza valores no finitos', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) expect(hasAtMostThreeDecimals(value)).toBe(false);
  });
});

describe('punto dentro, en el borde o fuera', () => {
  it('el interior (sedes de siembra) está dentro', () => {
    expect(isInsideOrOnBoundary(-12.046, -77.043)).toBe(true);
    expect(isInsideOrOnBoundary(-12.12, -77.0375)).toBe(true);
    expect(isInsideOrOnBoundary(-12.077, -77.082)).toBe(true);
  });

  it('un vértice y un punto sobre un borde cuentan como dentro', () => {
    expect(isInsideOrOnBoundary(-11.8, -77.2)).toBe(true);
    expect(isInsideOrOnBoundary(-11.8, -77.05)).toBe(true);
    expect(isInsideOrOnBoundary(-12.1, -77.2)).toBe(true);
    expect(isInsideOrOnBoundary(-12.3, -77.0)).toBe(true);
  });

  it('el exterior queda fuera, incluso pegado al borde', () => {
    expect(isInsideOrOnBoundary(-13.0, -77.0)).toBe(false);
    expect(isInsideOrOnBoundary(-12.05, -75.0)).toBe(false);
    expect(isInsideOrOnBoundary(-11.799, -77.05)).toBe(false);
    expect(isInsideOrOnBoundary(-12.0, -77.21)).toBe(false);
    expect(isInsideOrOnBoundary(-12.301, -77.0)).toBe(false);
  });
});

describe('validateApproximateLocation', () => {
  it('acepta una ubicación válida y devuelve la versión del polígono', () => {
    expect(validateApproximateLocation({ latitude: -12.046, longitude: -77.043 })).toEqual({ ok: true, polygonVersion: 'DEMO_ONLY-1' });
  });

  it('rechaza cuatro decimales, rango inválido y fuera de Lima, en ese orden de motivo', () => {
    expect(validateApproximateLocation({ latitude: -12.0461, longitude: -77.043 })).toEqual({ ok: false, reason: 'precision' });
    expect(validateApproximateLocation({ latitude: -91, longitude: -77.043 })).toEqual({ ok: false, reason: 'range' });
    expect(validateApproximateLocation({ latitude: -12.046, longitude: 181 })).toEqual({ ok: false, reason: 'range' });
    expect(validateApproximateLocation({ latitude: Number.NaN, longitude: -77 })).toEqual({ ok: false, reason: 'range' });
    expect(validateApproximateLocation({ latitude: -12.046, longitude: -75.0 })).toEqual({ ok: false, reason: 'outside' });
  });
});
