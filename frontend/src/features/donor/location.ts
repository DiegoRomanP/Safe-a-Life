// Ubicación aproximada del contrato (ApproximateLocation): latitud y longitud
// con hasta tres decimales, dentro de ±90 y ±180. Devuelve el mensaje de error
// o undefined. La comparten el perfil (DON-02) y el onboarding (DON-01).
const DECIMALS = /^-?\d{1,3}(\.\d{1,3})?$/;

function coordinateError(value: string, limit: number, name: string): string | undefined {
  if (!DECIMALS.test(value.trim())) return `Ingresa la ${name} con hasta tres decimales.`;
  if (Math.abs(Number(value)) > limit) return `La ${name} debe estar entre −${limit} y ${limit}.`;
  return undefined;
}

export const latitudeError = (value: string) => coordinateError(value, 90, 'latitud');
export const longitudeError = (value: string) => coordinateError(value, 180, 'longitud');

// Réplica del polígono DEMO_ONLY-1 (`[longitud, latitud]`, cerrado) de backend/.../domain/lima-polygon.ts;
// una prueba compara los vértices. Quien decide al guardar es el backend y la base.
export const LIMA_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [-77.20, -11.80], [-76.90, -11.80], [-76.85, -12.00], [-76.90, -12.30], [-77.15, -12.30], [-77.20, -12.10], [-77.20, -11.80],
];

// Enteros en milésimas: el producto cruzado del borde es exacto, como con `numeric` en la base.
const milli = (degrees: number) => Math.round(degrees * 1000);

// Misma lógica que app.in_lima_demo_1 (borde incluido), para un punto ya redondeado a tres decimales.
export function insideLima(latitude: number, longitude: number): boolean {
  const x = milli(longitude);
  const y = milli(latitude);
  let inside = false;
  for (let i = 1; i < LIMA_POLYGON.length; i += 1) {
    const [xi, yi] = LIMA_POLYGON[i]!.map(milli) as [number, number];
    const [xj, yj] = LIMA_POLYGON[i - 1]!.map(milli) as [number, number];
    const cross = (x - xj) * (yi - yj) - (y - yj) * (xi - xj);
    if (cross === 0 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
