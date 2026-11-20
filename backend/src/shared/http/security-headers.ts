import type { RequestHandler } from 'express';

const HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // ADR-004: el frontend comparte origen con la API detrás del proxy; ningún otro origen debe incrustar sus respuestas.
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
});

/** Cabeceras defensivas para una API JSON. Se montan primero para que cubran también los errores. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [name, value] of Object.entries(HEADERS)) res.setHeader(name, value);
  next();
};
