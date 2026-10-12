import type { Response } from 'express';
import { ApiError } from '../http/errors.js';
import type { TokenPair } from './session-ports.js';

export type PrincipalRole = 'donante' | 'admin_hospitalario' | 'superadmin';

export type Principal = Readonly<{
  userId: string;
  sessionId: string;
  aal: 'aal1' | 'aal2';
  amr: readonly Readonly<{ method: string; timestamp: number }>[];
  accessToken: string;
  role: PrincipalRole;
  displayName: string;
  hospital: Readonly<{
    hospitalId: string;
    hospitalName: string;
    membershipActive: boolean;
    hospitalAuthorized: boolean;
  }> | null;
}>;

export function setPrincipal(res: Response, principal: Principal): void {
  res.locals.principal = principal;
}

/** Principal ya autenticado por el middleware, o undefined si la petición no tiene sesión. */
export function findPrincipal(res: Response): Principal | undefined {
  return res.locals.principal as Principal | undefined;
}

export function requirePrincipal(res: Response): Principal {
  const principal = findPrincipal(res);
  if (!principal) throw new ApiError('AUTHENTICATION_REQUIRED');
  return principal;
}

/** Tokens vigentes de esta petición (los de las cookies o los recién renovados), para llamadas de MFA. */
export function setSessionTokens(res: Response, tokens: TokenPair): void {
  res.locals.sessionTokens = tokens;
}

export function findSessionTokens(res: Response): TokenPair | undefined {
  return res.locals.sessionTokens as TokenPair | undefined;
}
