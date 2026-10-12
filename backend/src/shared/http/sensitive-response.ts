import type { RequestHandler } from 'express';

/** Para páginas o respuestas que llevan tokens de acción (SEC-13). */
export const noStoreNoReferrer: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};
