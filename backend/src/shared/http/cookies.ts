export const ACCESS_COOKIE = '__Host-sal_at';
export const REFRESH_COOKIE = '__Host-sal_rt';

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Tokens JWT (base64url y puntos) y valores equivalentes; nunca comillas, `;` ni espacios. */
const VALUE_PATTERN = /^[A-Za-z0-9._~+/=-]*$/;

/** Primera ocurrencia de cada nombre; ignora nombres o valores fuera de lo permitido. */
export function parseCookies(header: string | undefined): Readonly<Record<string, string>> {
  const cookies: Record<string, string> = Object.create(null);
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!NAME_PATTERN.test(name) || !VALUE_PATTERN.test(value) || name in cookies) continue;
    cookies[name] = value;
  }
  return cookies;
}

export interface CookieOptions {
  readonly maxAge: number;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'Lax' | 'Strict' | 'None';
  readonly path: string;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!NAME_PATTERN.test(name) || !VALUE_PATTERN.test(value) || !/^\/[\x21-\x3A\x3C-\x7E]*$/.test(options.path)) {
    throw new Error('Cookie inválida.');
  }
  if (!Number.isInteger(options.maxAge) || options.maxAge < 0) throw new Error('Cookie inválida.');
  if (name.startsWith('__Host-') && (!options.secure || options.path !== '/')) throw new Error('Cookie inválida.');
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    options.httpOnly ? 'HttpOnly' : null,
    options.secure ? 'Secure' : null,
    `SameSite=${options.sameSite}`,
  ].filter(Boolean).join('; ');
}

/** Cookie de sesión del backend: HttpOnly, Secure, Lax, Path=/ (ADR-004). */
export function sessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return serializeCookie(name, value, { maxAge: maxAgeSeconds, httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
}

export function expiredCookie(name: string): string {
  return sessionCookie(name, '', 0);
}
