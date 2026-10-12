import type { Request } from 'express';
import { hmacSha256Hex } from '../crypto/hmac.js';

/** Sujeto del rate limit por IP: HMAC del `req.ip` resuelto con `trust proxy`. Nunca la IP en claro. */
export function clientIpSubject(req: Request, secret: string): string {
  return hmacSha256Hex(secret, `ip:${req.ip ?? 'desconocida'}`);
}
