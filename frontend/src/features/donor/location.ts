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
