import type { Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE, expiredCookie, sessionCookie } from '../http/cookies.js';
import type { TokenPair } from './session-ports.js';

/** Vida de la cookie de refresh (V4): 12 h, igual que `inactivity_timeout`. */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 43_200;

export function setSessionCookies(res: Response, pair: TokenPair): void {
  res.append('Set-Cookie', sessionCookie(ACCESS_COOKIE, pair.accessToken, pair.expiresIn));
  res.append('Set-Cookie', sessionCookie(REFRESH_COOKIE, pair.refreshToken, REFRESH_COOKIE_MAX_AGE_SECONDS));
}

export function clearSessionCookies(res: Response): void {
  res.append('Set-Cookie', expiredCookie(ACCESS_COOKIE));
  res.append('Set-Cookie', expiredCookie(REFRESH_COOKIE));
}
