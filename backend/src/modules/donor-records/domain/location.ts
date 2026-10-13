import { LIMA_POLYGON, type LimaPolygon } from './lima-polygon.js';

export type ApproximateLocation = Readonly<{ latitude: number; longitude: number }>;

const EPSILON = 1e-9;

/** Como mucho tres decimales (≈ 110 m). Comparación por enteros: sin depender de la representación binaria. */
export function hasAtMostThreeDecimals(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = value * 1000;
  return Math.abs(Math.round(scaled) - scaled) < EPSILON;
}

function onSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > EPSILON) return false;
  return px >= Math.min(ax, bx) - EPSILON && px <= Math.max(ax, bx) + EPSILON
    && py >= Math.min(ay, by) - EPSILON && py <= Math.max(ay, by) + EPSILON;
}

/** Punto dentro del polígono o sobre su borde (ray casting; un punto sobre un segmento cuenta como dentro). */
export function isInsideOrOnBoundary(latitude: number, longitude: number, polygon: LimaPolygon = LIMA_POLYGON): boolean {
  const ring = polygon.coordinates;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (onSegment(longitude, latitude, xi, yi, xj, yj)) return true;
    if ((yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type LocationVerdict = Readonly<{ ok: true; polygonVersion: string }> | Readonly<{ ok: false; reason: 'precision' | 'range' | 'outside' }>;

/** Reglas de la ubicación aproximada: rango válido, máximo tres decimales y dentro del polígono versionado. */
export function validateApproximateLocation(location: ApproximateLocation, polygon: LimaPolygon = LIMA_POLYGON): LocationVerdict {
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, reason: 'range' };
  }
  if (!hasAtMostThreeDecimals(latitude) || !hasAtMostThreeDecimals(longitude)) return { ok: false, reason: 'precision' };
  if (!isInsideOrOnBoundary(latitude, longitude, polygon)) return { ok: false, reason: 'outside' };
  return { ok: true, polygonVersion: polygon.version };
}
