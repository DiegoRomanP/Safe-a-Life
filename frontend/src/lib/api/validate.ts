import { ApiError } from '../demoApi.js';
import type { apiRequest } from './http.js';

// Validadores mínimos de respuestas del backend: una forma inesperada lanza ApiError('red') y la vista nunca pinta datos a medias.
export type Rec = Record<string, unknown>;
export const malformed = (): never => { throw new ApiError('red'); };
export const rec = (value: unknown): Rec => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : malformed());
export const str = (value: unknown, max = 1000): string => (typeof value === 'string' && value.length <= max ? value : malformed());
export const bool = (value: unknown): boolean => (typeof value === 'boolean' ? value : malformed());
export const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : malformed());
export const int = (value: unknown, min: number, max: number): number => {
  const n = num(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : malformed();
};
export const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T => (allowed.includes(value as T) ? (value as T) : malformed());
export const dataOf = (body: unknown): unknown => rec(body).data;

const MAX_PAGES = 20;

/** Sigue `nextCursor` de las listas paginadas (limit 100) hasta agotarlas. Tope de páginas para no iterar sin fin. */
export async function listAll<T>(call: typeof apiRequest, path: string, parse: (value: unknown) => T): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query: string = `limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = rec(dataOf(await call('GET', `${path}?${query}`)));
    if (!Array.isArray(data.items)) malformed();
    items.push(...(data.items as unknown[]).map(parse));
    const next: unknown = rec(data.pagination).nextCursor;
    if (next === null || next === undefined) return items;
    cursor = str(next, 512);
  }
  throw new ApiError('red');
}
