import type { Request, RequestHandler, Response } from 'express';
import { requireActiveMembership, requireAal2, requireRole, requireSession, requireStepUp } from '../auth/guards.js';
import { requirePrincipal } from '../auth/principal.js';
import type { Page } from '../persistence/page.js';
import { decodeCursor, encodeCursor, type CursorPosition } from '../persistence/cursor.js';
import type { OperationValidator } from '../validation/contract-validator.js';
import { requireCsrf } from './csrf-guard.js';
import { requireIdempotencyKey } from './idempotency.js';
import { sendData } from './respond.js';

export { requireIdempotencyKey, requirePrincipal };

export interface HttpSecrets {
  readonly csrf: string;
  readonly cursor: string;
  readonly allowedOrigins: readonly string[];
}

/** Guards de lectura y escritura por grupo de rutas (matriz de la spec §7). */
export function guardsFor(secrets: HttpSecrets) {
  const csrf = requireCsrf(secrets.csrf, secrets.allowedOrigins);
  const superadminRead: RequestHandler[] = [requireSession, requireRole('superadmin'), requireAal2];
  const adminRead: RequestHandler[] = [requireSession, requireRole('admin_hospitalario'), requireAal2, requireActiveMembership];
  const donorRead: RequestHandler[] = [requireSession, requireRole('donante')];
  return Object.freeze({
    session: [requireSession] as RequestHandler[],
    sessionWrite: [requireSession, csrf] as RequestHandler[],
    superadminRead,
    superadminWrite: [...superadminRead, csrf] as RequestHandler[],
    // CSRF antes que el step-up: sin CSRF válido la respuesta es ACCESS_DENIED, no STEP_UP_REQUIRED (ADR-004).
    superadminStepUp: [...superadminRead, csrf, requireStepUp()] as RequestHandler[],
    adminRead,
    adminWrite: [...adminRead, csrf] as RequestHandler[],
    donorRead,
    donorWrite: [...donorRead, csrf] as RequestHandler[],
  });
}

export function pageLimit(query: unknown): number {
  const limit = (query as { limit?: number }).limit;
  return limit ?? 20;
}

/** Posición de cursor opcional, validada y ligada al actor y a la operación. */
export function readCursor(res: Response, operation: string, query: unknown, secret: string): CursorPosition | null {
  const cursor = (query as { cursor?: string }).cursor;
  if (cursor === undefined) return null;
  return decodeCursor(`${requirePrincipal(res).userId}:${operation}`, cursor, secret);
}

export function nextCursor(res: Response, operation: string, next: unknown, secret: string): string | null {
  if (next === null || next === undefined) return null;
  const { createdAt, id } = next as { createdAt?: string; id: string };
  return encodeCursor(`${requirePrincipal(res).userId}:${operation}`, { createdAt: createdAt ?? '-', id }, secret);
}

export function parse<T>(validator: OperationValidator, part: 'body' | 'query' | 'params', req: Request): T {
  switch (part) {
    case 'body': return validator.parseBody(req.body) as T;
    case 'query': return validator.parseQuery(req.query as Record<string, unknown>) as T;
    default: return validator.parseParams(req.params as Record<string, unknown>) as T;
  }
}

/** Valida la salida contra el contrato de la operación y devuelve el contenido de `data`. */
export const ok = (validator: OperationValidator, data: unknown): unknown => (validator.assertSuccess({ data }) as { data: unknown }).data;

/** Query vacía: el contrato es cerrado, un parámetro desconocido es 400. */
export const noQuery = (validator: OperationValidator, req: { query: unknown }) =>
  validator.parseQuery(req.query as Record<string, unknown>);

/** Página común: items + cursor opaco firmado y ligado al actor y a la operación. */
export function respondPage<T>(validator: OperationValidator, operation: string, result: Page<T>, res: Response, cursorSecret: string): void {
  sendData(res, 200, ok(validator, {
    items: result.items,
    pagination: { nextCursor: nextCursor(res, operation, result.next, cursorSecret) },
  }));
}
