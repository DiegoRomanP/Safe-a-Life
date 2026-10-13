import type { Response } from 'express';
import { findSessionTokens } from '../../../shared/auth/principal.js';
import type { TokenPair } from '../../../shared/auth/session-ports.js';
import { ApiError } from '../../../shared/http/errors.js';

export {
  guardsFor, nextCursor, noQuery, ok, pageLimit, parse, readCursor, requireIdempotencyKey, requirePrincipal, respondPage,
  type HttpSecrets,
} from '../../../shared/http/route-helpers.js';

/** Tokens de la petición; sin refresh token no se pueden hacer llamadas de MFA. */
export function requireTokens(res: Response): TokenPair {
  const tokens = findSessionTokens(res);
  if (!tokens) throw new ApiError('AUTHENTICATION_REQUIRED');
  return tokens;
}
