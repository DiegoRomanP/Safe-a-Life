import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const ERROR_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  RESOURCE_NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  ACTION_UNAVAILABLE: 410,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const);

export type PublicErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorResponse {
  readonly error: {
    readonly code: PublicErrorCode;
    readonly message: string;
    readonly correlationId: string;
  };
}

const DEFAULT_MESSAGES: Readonly<Record<PublicErrorCode, string>> = Object.freeze({
  BAD_REQUEST: 'Solicitud malformada.',
  AUTHENTICATION_REQUIRED: 'La sesión no está vigente.',
  ACCESS_DENIED: 'La acción no está permitida.',
  RESOURCE_NOT_FOUND: 'El recurso no está disponible.',
  STATE_CONFLICT: 'La operación entra en conflicto con el estado actual.',
  ACTION_UNAVAILABLE: 'El enlace no está disponible.',
  VALIDATION_FAILED: 'Uno o más valores no cumplen las reglas del campo.',
  RATE_LIMITED: 'Intenta nuevamente más tarde.',
  INTERNAL_ERROR: 'No se pudo completar la solicitud.',
  SERVICE_UNAVAILABLE: 'El servicio no está listo para aceptar solicitudes.',
});

/**
 * Error esperado y seguro para el cliente. El mensaje lo fija el código de
 * aplicación y nunca debe contener datos personales ni detalles internos.
 */
export class ApiError extends Error {
  readonly code: PublicErrorCode;

  constructor(code: PublicErrorCode, message: string = DEFAULT_MESSAGES[code]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface PublicError {
  readonly status: number;
  readonly body: ErrorResponse;
}

/** Cualquier error que no sea ApiError se presenta como INTERNAL_ERROR genérico. */
export function toPublicError(error: unknown, correlationId: string): PublicError {
  const code: PublicErrorCode = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof ApiError ? error.message : DEFAULT_MESSAGES.INTERNAL_ERROR;

  return {
    status: ERROR_STATUS[code],
    body: { error: { code, message, correlationId } },
  };
}

/**
 * Errores 4xx de Express o body-parser (JSON roto, cuerpo grande, codificación
 * o charset no soportados, parámetro de ruta no decodificable) son del cliente:
 * se devuelven como BAD_REQUEST.
 */
function fromClientError(error: unknown): ApiError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status } = error as { status?: unknown };
  return Number.isInteger(status) && (status as number) >= 400 && (status as number) <= 499 ? new ApiError('BAD_REQUEST') : undefined;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError('RESOURCE_NOT_FOUND'));
};

export function createErrorHandler(onUnexpected?: (error: unknown, correlationId: string) => void): ErrorRequestHandler {
  // Si el diagnóstico falla, el error nuevo no debe llegar al manejador final de Express (stack en la respuesta).
  const report = (error: unknown, correlationId: string): void => {
    try {
      onUnexpected?.(error, correlationId);
    } catch {
      // Intencionalmente vacío: nada que registrar sin riesgo de filtrar datos.
    }
  };

  // Express reconoce un manejador de errores por su aridad (4 parámetros).
  return (error, req, res, _next) => {
    const correlationId = typeof res.locals.correlationId === 'string' ? res.locals.correlationId : randomUUID();

    // Con cabeceras ya enviadas no se puede responder. next(error) llevaría al
    // manejador final de Express, que imprime el stack en stderr (OBS-01).
    if (res.headersSent) {
      report(error, correlationId);
      req.socket.destroy();
      return;
    }

    const clientError = fromClientError(error);
    if (!clientError && !(error instanceof ApiError)) report(error, correlationId);

    const { status, body } = toPublicError(clientError ?? error, correlationId);
    res.status(status).type('application/json').json(body);
  };
}
