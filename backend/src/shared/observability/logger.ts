export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Único contenido que puede salir a los logs. Cualquier otra propiedad se ignora.
 * Nunca se pasan bodies, query strings, URLs completas, cookies, tokens, claves
 * de idempotencia, emails, coordenadas ni errores con mensaje o stack (OBS-01/02).
 */
/** Unión cerrada de eventos: un evento nuevo exige declararlo aquí (y revisar que no arrastre PII). */
export type LogEvent =
  | 'peticion.finalizada'
  | 'peticion.fallida'
  | 'seguridad.rechazo'
  | 'proceso.error_no_controlado'
  | 'servidor.iniciado'
  | 'worker.iniciado'
  | 'worker.ciclo'
  | 'worker.error'
  | 'webhook.recibido';

export interface LogEntry {
  readonly event: LogEvent;
  readonly module?: string;
  readonly code?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
  /** Código HTTP de la respuesta. */
  readonly status?: number;
  /** Plantilla de la ruta (`/api/v1/x/:id`), nunca la URL real. */
  readonly route?: string;
  /** Motivo interno de un rechazo de seguridad (`edge`, `csrf`, `origin`, `provider_rate_limited`...). */
  readonly reason?: string;
}

export interface Logger {
  log(level: LogLevel, entry: LogEntry): void;
}

const TOKEN_PATTERN = /^[a-z0-9_.-]{1,80}$/;
const ROUTE_PATTERN = /^[A-Za-z0-9/_:.-]{1,120}$/;
const CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
const CORRELATION_PATTERN = /^[A-Za-z0-9-]{1,100}$/;
const FALLBACK_EVENT = 'evento_no_valido';

function matching(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function httpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

export function createLogger(write: (line: string) => void, now: () => Date = () => new Date()): Logger {
  return {
    log(level, entry) {
      const record = {
        time: now().toISOString(),
        level,
        event: matching(entry.event, TOKEN_PATTERN) ?? FALLBACK_EVENT,
        module: matching(entry.module, TOKEN_PATTERN),
        code: matching(entry.code, CODE_PATTERN),
        correlationId: matching(entry.correlationId, CORRELATION_PATTERN),
        durationMs: nonNegativeNumber(entry.durationMs),
        status: httpStatus(entry.status),
        route: matching(entry.route, ROUTE_PATTERN),
        reason: matching(entry.reason, TOKEN_PATTERN),
      };
      write(JSON.stringify(record));
    },
  };
}
