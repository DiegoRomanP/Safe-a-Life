import type { RequestHandler } from 'express';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  // Dos años. Sin `preload` hasta tener el dominio definitivo (el alta en la lista de precarga es difícil de revertir).
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  // ADR-004: el frontend comparte origen con la API detrás del proxy; ningún otro origen debe incrustar sus respuestas.
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
});

/** Cabeceras defensivas para una API JSON. Se montan primero para que cubran también los errores. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  next();
};
