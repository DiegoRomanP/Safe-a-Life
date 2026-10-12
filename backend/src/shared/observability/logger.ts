export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Único contenido que puede salir a los logs. Cualquier otra propiedad se ignora.
 * Nunca se pasan bodies, query strings, URLs completas, cookies, tokens, claves
 * de idempotencia, emails, coordenadas ni errores con mensaje o stack (OBS-01/02).
 */
export interface LogEntry {
  readonly event: string;
  readonly module?: string;
  readonly code?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
}

export interface Logger {
  log(level: LogLevel, entry: LogEntry): void;
}

const TOKEN_PATTERN = /^[a-z0-9_.-]{1,80}$/;
const CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
const CORRELATION_PATTERN = /^[A-Za-z0-9-]{1,100}$/;
const FALLBACK_EVENT = 'evento_no_valido';

function matching(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
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
      };
      write(JSON.stringify(record));
    },
  };
}
