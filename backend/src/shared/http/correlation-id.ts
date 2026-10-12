import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Asigna un identificador opaco por petición. Se genera en servidor y nunca se
 * toma del cliente, para que no pueda inyectar contenido en los registros.
 */
export const correlationIdMiddleware: RequestHandler = (_req, res, next) => {
  res.locals.correlationId = randomUUID();
  next();
};
