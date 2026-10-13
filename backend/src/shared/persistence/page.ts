import type { CursorPosition } from './cursor.js';
import { asArray, asString, closedRecord } from './guards.js';

export type PageQuery = Readonly<{ limit: number; cursor: CursorPosition | null }>;
export type Page<T> = Readonly<{ items: readonly T[]; next: CursorPosition | null }>;

/** `{createdAt, id}` de la última fila de la página, o null si no hay más. */
export function parseNext(value: unknown): CursorPosition | null {
  if (value === null || value === undefined) return null;
  const row = closedRecord(value, ['id'], ['createdAt']);
  return Object.freeze({ createdAt: row.createdAt === undefined ? '-' : asString(row.createdAt), id: asString(row.id) });
}

export function pageOf<T>(reply: Record<string, unknown>, parse: (value: unknown) => T): Page<T> {
  return Object.freeze({ items: Object.freeze(asArray(reply.items).map(parse)), next: parseNext(reply.next) });
}
