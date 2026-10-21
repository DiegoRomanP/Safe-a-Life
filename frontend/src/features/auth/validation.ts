// Reglas del contrato para correo (email, máx. 254) y contraseña nueva
// (12 a 128 caracteres). Devuelven el mensaje de error o undefined.
export function emailError(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Ingresa tu correo.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return 'Ingresa un correo válido.';
  return undefined;
}

export const PASSWORD_HINT = 'Usa entre 12 y 128 caracteres. No uses credenciales reales.';

export function newPasswordError(value: string): string | undefined {
  if (!value) return 'Ingresa una contraseña.';
  if (value.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  if (value.length > 128) return 'La contraseña no puede superar 128 caracteres.';
  return undefined;
}
