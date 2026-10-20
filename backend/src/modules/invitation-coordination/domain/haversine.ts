/** Radio medio terrestre en metros (B.3). */
export const EARTH_RADIUS_M = 6_371_008.8;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Distancia de círculo máximo en metros, sin redondeo. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** El borde se incluye (`<=`). */
export function isWithinRadius(distanceMeters: number, radiusKm: number): boolean {
  return distanceMeters <= radiusKm * 1000;
}
