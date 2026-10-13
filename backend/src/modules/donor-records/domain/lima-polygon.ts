/**
 * Polígono de Lima Metropolitana versionado (V11). Mientras no exista el archivo oficial, es una envolvente SINTÉTICA
 * (`DEMO_ONLY-1`) que cubre la zona urbana; no es un límite administrativo ni debe usarse fuera del prototipo.
 * Coordenadas `[longitud, latitud]`, polígono cerrado (el último vértice repite el primero).
 */
export type LimaPolygon = Readonly<{
  version: string;
  sha256: string;
  coordinates: ReadonlyArray<readonly [number, number]>;
}>;

export const LIMA_POLYGON: LimaPolygon = Object.freeze({
  version: 'DEMO_ONLY-1',
  /** SHA-256 de `JSON.stringify(coordinates)`; una prueba lo recalcula. */
  sha256: 'd76573b19078dfa7cd97dac3a252598b30abc36a7d30f955248e3c4eedbee1e8',
  coordinates: Object.freeze([
    [-77.20, -11.80], [-76.90, -11.80], [-76.85, -12.00], [-76.90, -12.30], [-77.15, -12.30], [-77.20, -12.10], [-77.20, -11.80],
  ] as const),
});
