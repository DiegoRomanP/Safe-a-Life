import { PersistenceError } from './errors.js';

/**
 * Guards cerrados para las proyecciones que devuelven las RPC (ADR-003): una clave de más, de menos
 * o de otro tipo es un fallo de persistencia (500 genérico), nunca se serializa tal cual.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function closedRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isPlainObject(value)) throw new PersistenceError('shape');
  const keys = Object.keys(value);
  if (!required.every((key) => keys.includes(key)) || !keys.every((key) => required.includes(key) || optional.includes(key))) {
    throw new PersistenceError('shape');
  }
  return value;
}

export function asString(value: unknown): string {
  if (typeof value !== 'string') throw new PersistenceError('shape');
  return value;
}

export function asNullableString(value: unknown): string | null {
  return value === null ? null : asString(value);
}

export function asBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new PersistenceError('shape');
  return value;
}

export function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new PersistenceError('shape');
  return value;
}

export function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new PersistenceError('shape');
  return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new PersistenceError('shape');
  return value as T;
}
