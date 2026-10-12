import type { RequestHandler } from 'express';

const HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

/** Cabeceras defensivas para una API JSON. Se montan primero para que cubran también los errores. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [name, value] of Object.entries(HEADERS)) res.setHeader(name, value);
  next();
};
