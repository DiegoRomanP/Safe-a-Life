import { ApiError } from '../../lib/demoApi.js';
import type { TokenStatus } from './components/TokenStatusView.js';

/** Estado del enlace según la respuesta del backend; `null` si el fallo no dice nada del enlace (red, 429, 5xx). */
export function tokenStatusFor(error: unknown): TokenStatus | null {
  const status = error instanceof ApiError ? error.status : undefined;
  // 410: usado, vencido o invalidado (el backend no los distingue).
  if (status === 410) return 'expired';
  if (status === 400 || status === 404 || status === 409) return 'invalid';
  return null;
}
