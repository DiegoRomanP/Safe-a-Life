import type { RequestHandler } from 'express';
import { ApiError } from '../http/errors.js';
import { findPrincipal, type Principal, type PrincipalRole } from './principal.js';

const DEFAULT_STEP_UP_SECONDS = 300;

/** Defensa en profundidad: la RPC repite estas comprobaciones en SQL. */
export const requireSession: RequestHandler = (_req, res, next) => {
  next(findPrincipal(res) ? undefined : new ApiError('AUTHENTICATION_REQUIRED'));
};

export function requireRole(...roles: readonly PrincipalRole[]): RequestHandler {
  return (_req, res, next) => {
    const principal = findPrincipal(res);
    if (!principal) return next(new ApiError('AUTHENTICATION_REQUIRED'));
    next(roles.includes(principal.role) ? undefined : new ApiError('ACCESS_DENIED'));
  };
}

export const requireAal2: RequestHandler = (_req, res, next) => {
  const principal = findPrincipal(res);
  if (!principal) return next(new ApiError('AUTHENTICATION_REQUIRED'));
  next(principal.aal === 'aal2' ? undefined : new ApiError('MFA_REQUIRED'));
};

/** `amr` contiene un TOTP con `timestamp >= now − maxAge` (ADR-004). */
export function isStepUpFresh(principal: Pick<Principal, 'amr'>, nowSeconds: number, maxAgeSeconds = DEFAULT_STEP_UP_SECONDS): boolean {
  return principal.amr.some(({ method, timestamp }) => method === 'totp' && timestamp >= nowSeconds - maxAgeSeconds);
}

export function requireStepUp(maxAgeSeconds = DEFAULT_STEP_UP_SECONDS, now: () => number = () => Date.now()): RequestHandler {
  return (_req, res, next) => {
    const principal = findPrincipal(res);
    if (!principal) return next(new ApiError('AUTHENTICATION_REQUIRED'));
    next(isStepUpFresh(principal, Math.floor(now() / 1000), maxAgeSeconds) ? undefined : new ApiError('STEP_UP_REQUIRED'));
  };
}

export const requireActiveMembership: RequestHandler = (_req, res, next) => {
  const principal = findPrincipal(res);
  if (!principal) return next(new ApiError('AUTHENTICATION_REQUIRED'));
  const { hospital } = principal;
  next(hospital?.membershipActive && hospital.hospitalAuthorized ? undefined : new ApiError('ACCESS_DENIED'));
};
