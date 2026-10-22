import { describe, expect, it } from 'vitest';
import { batchSize } from './batch-size.js';
import { MATRIZ_RBC_ACADEMICA_V1, isCompatible, isExactMatch } from './compatibility.js';
import { EARTH_RADIUS_M, haversineMeters, isWithinRadius } from './haversine.js';
import { canTransitionDelivery, canTransitionResponse, canTransitionValidity } from './invitation-state.js';
import { NEED_DONOR_CODE_LENGTH, generateNeedDonorCode } from './need-donor-code.js';
import { rankCandidates } from './ranking.js';

const TYPES = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'] as const;
// Regla independiente de la tabla: Rh- solo a Rh- o Rh+ si el ABO es compatible, etc.
const rule = (d: string, r: string): boolean => {
  const [dAbo, dRh] = d.split('_') as [string, string];
  const [rAbo, rRh] = r.split('_') as [string, string];
  const aboOk = dAbo === 'O' || dAbo === rAbo || rAbo === 'AB';
  return aboOk && (dRh === 'NEG' || rRh === 'POS');
};

describe('matriz RBC académica (B.2)', () => {
  it('coincide con la matriz declarada en las 64 parejas y permite 27', () => {
    let allowed = 0;
    for (const d of TYPES) for (const r of TYPES) {
      expect(isCompatible(d, r), `${d}→${r}`).toBe(rule(d, r));
      if (isCompatible(d, r)) allowed += 1;
    }
    expect(allowed).toBe(27);
    expect(MATRIZ_RBC_ACADEMICA_V1.O_NEG).toHaveLength(8);
  });
  it('exacto solo con el mismo valor', () => {
    expect(isExactMatch('A_POS', 'A_POS')).toBe(true);
    expect(isExactMatch('O_NEG', 'A_POS')).toBe(false);
  });
});

describe('haversine', () => {
  it('es cero para el mismo punto y simétrica', () => {
    expect(haversineMeters(-12.05, -77.04, -12.05, -77.04)).toBe(0);
    expect(haversineMeters(-12.05, -77.04, -12.1, -77.0)).toBeCloseTo(haversineMeters(-12.1, -77.0, -12.05, -77.04), 9);
  });
  it('un grado de latitud mide R·π/180', () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 6);
  });
  it('incluye el borde del radio', () => {
    const d = 5000;
    expect(isWithinRadius(d, 5)).toBe(true);
    expect(isWithinRadius(d + 1e-6, 5)).toBe(false);
  });
});

describe('batchSize', () => {
  it.each([[1, 5], [2, 5], [3, 6], [25, 50], [26, 50], [50, 50]])('meta %i → %i', (meta, n) => {
    expect(batchSize(meta)).toBe(n);
  });
});

describe('ranking', () => {
  it('exactas primero, luego distancia y luego donorId', () => {
    const out = rankCandidates([
      { donorId: 'c', isExact: false, distanceM: 100 },
      { donorId: 'b', isExact: true, distanceM: 900 },
      { donorId: 'a', isExact: true, distanceM: 900 },
      { donorId: 'd', isExact: true, distanceM: 50 },
    ]).map((c) => c.donorId);
    expect(out).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('estados de invitación (B.5)', () => {
  it('vigencia: solo activa avanza', () => {
    expect(canTransitionValidity('activa', 'invalidada')).toBe(true);
    expect(canTransitionValidity('activa', 'vencida')).toBe(true);
    expect(canTransitionValidity('vencida', 'activa')).toBe(false);
    expect(canTransitionValidity('invalidada', 'activa')).toBe(false);
  });
  it('entrega: fallida → pendiente es posible; entregada es final', () => {
    expect(canTransitionDelivery('pendiente', 'enviada')).toBe(true);
    expect(canTransitionDelivery('enviada', 'entregada')).toBe(true);
    expect(canTransitionDelivery('fallida', 'pendiente')).toBe(true);
    expect(canTransitionDelivery('entregada', 'fallida')).toBe(false);
    expect(canTransitionDelivery('pendiente', 'entregada')).toBe(false);
  });
  it('respuesta: confirmada ↔ rechazada, sin volver a sin_respuesta', () => {
    expect(canTransitionResponse('sin_respuesta', 'confirmada')).toBe(true);
    expect(canTransitionResponse('confirmada', 'rechazada')).toBe(true);
    expect(canTransitionResponse('rechazada', 'confirmada')).toBe(true);
    expect(canTransitionResponse('confirmada', 'sin_respuesta')).toBe(false);
  });
});

describe('needDonorCode', () => {
  it('son 10 caracteres Crockford sin I, L, O ni U', () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, i) => i * 25);
    const code = generateNeedDonorCode(() => bytes);
    expect(code).toHaveLength(NEED_DONOR_CODE_LENGTH);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });
  it('rechaza aleatoriedad corta', () => {
    expect(() => generateNeedDonorCode(() => new Uint8Array(3))).toThrow(RangeError);
  });
});
