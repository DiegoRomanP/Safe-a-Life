import { describe, expect, it } from 'vitest';
import { isCompatible, isExactMatch, MATRIZ_RBC_ACADEMICA_V1 } from '../../src/modules/invitation-coordination/domain/compatibility.js';
import { haversineMeters } from '../../src/modules/invitation-coordination/domain/haversine.js';
import { sql } from '../support/db.js';

// Paridad TS↔SQL contra la base local (el pgTAP 13 fija los mismos valores como literales).
const GROUPS = Object.keys(MATRIZ_RBC_ACADEMICA_V1) as (keyof typeof MATRIZ_RBC_ACADEMICA_V1)[];

describe('paridad de la matriz RBC', () => {
  it('app.rbc_compatibility coincide con MATRIZ_RBC_ACADEMICA_V1 en los 64 pares', () => {
    const rows = sql('select donor || \'>\' || recipient || \'>\' || is_exact from app.rbc_compatibility').split('\n');
    const sqlPairs = new Map(rows.map((r) => [r.slice(0, r.lastIndexOf('>')), r.endsWith('true')]));
    for (const d of GROUPS) {
      for (const r of GROUPS) {
        expect(sqlPairs.has(`${d}>${r}`), `${d}>${r}`).toBe(isCompatible(d, r));
        if (isCompatible(d, r)) expect(sqlPairs.get(`${d}>${r}`)).toBe(isExactMatch(d, r));
      }
    }
    expect(sqlPairs.size).toBe(27);
  });
});

describe('paridad de Haversine', () => {
  it('app.haversine_m difiere de haversineMeters en 1e-6 m o menos', () => {
    const cases: [number, number, number, number][] = [
      [-12.046374, -77.042793, -12.1197, -77.0375], [0, 0, 0, 1], [40.7128, -74.006, 51.5074, -0.1278],
      [0, 0, 0, 180], [89.9, 10, -89.9, -170], [-12.0464, -77.0428, -12.0554, -77.0428], [-12.046, -77.043, -12.046, -77.043],
    ];
    for (const [a, b, c, d] of cases) {
      const fromSql = Number(sql(`select app.haversine_m(${a}, ${b}, ${c}, ${d})::text`));
      expect(Math.abs(fromSql - haversineMeters(a, b, c, d))).toBeLessThanOrEqual(1e-6);
    }
  });
});
