import type { Request, RequestHandler, Response } from 'express';
import { requireActiveMembership, requireAal2, requireRole, requireSession, requireStepUp } from '../../../shared/auth/guards.js';
import { findSessionTokens, requirePrincipal } from '../../../shared/auth/principal.js';
import type { TokenPair } from '../../../shared/auth/session-ports.js';
import { requireCsrf } from '../../../shared/http/csrf-guard.js';
import { ApiError } from '../../../shared/http/errors.js';
import { requireIdempotencyKey } from '../../../shared/http/idempotency.js';
import { decodeCursor, encodeCursor, type CursorPosition } from '../../../shared/persistence/cursor.js';
import type { OperationValidator } from '../../../shared/validation/contract-validator.js';

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
  return Object.freeze({
    session: [requireSession] as RequestHandler[],
    sessionWrite: [requireSession, csrf] as RequestHandler[],
    superadminRead,
    superadminWrite: [...superadminRead, csrf] as RequestHandler[],
    superadminStepUp: [...superadminRead, requireStepUp(), csrf] as RequestHandler[],
    adminRead,
    adminWrite: [...adminRead, csrf] as RequestHandler[],
  });
}

/** Tokens de la petición; sin refresh token no se pueden hacer llamadas de MFA. */
export function requireTokens(res: Response): TokenPair {
  const tokens = findSessionTokens(res);
  if (!tokens) throw new ApiError('AUTHENTICATION_REQUIRED');
  return tokens;
}

export { requireIdempotencyKey, requirePrincipal };

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

export type Parsed<T> = T;

export function parse<T>(validator: OperationValidator, part: 'body' | 'query' | 'params', req: Request): T {
  switch (part) {
    case 'body': return validator.parseBody(req.body) as T;
    case 'query': return validator.parseQuery(req.query as Record<string, unknown>) as T;
    default: return validator.parseParams(req.params as Record<string, unknown>) as T;
  }
}
