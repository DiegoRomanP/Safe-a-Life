import { isIPv6 } from 'node:net';
import type { Request } from 'express';
import { hmacSha256Hex } from '../crypto/hmac.js';

/**
 * Agrupa las direcciones IPv6 por prefijo /64 (un cliente suele controlar un /64 completo y podría
 * rotar direcciones para esquivar el límite). IPv4 y IPv4 mapeada se usan tal cual.
 */
export function normalizeClientIp(ip: string | undefined): string {
  if (!ip) return 'desconocida';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!isIPv6(ip)) return ip;

  const [head, tail = ''] = ip.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = ip.includes('::') && tail !== '' ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** Sujeto del rate limit por IP: HMAC del `req.ip` normalizado, resuelto con `trust proxy`. Nunca la IP en claro. */
export function clientIpSubject(req: Request, secret: string): string {
  return hmacSha256Hex(secret, `ip:${normalizeClientIp(req.ip)}`);
}
