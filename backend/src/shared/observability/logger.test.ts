import { describe, expect, it } from 'vitest';
import { createLogger, type LogEntry, type LogEvent } from './logger.js';

const FIXED_NOW = new Date('2026-10-12T12:00:00.000Z');

function capture() {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line), () => FIXED_NOW);
  return { lines, logger };
}

describe('createLogger', () => {
  it('escribe una línea JSON con los campos permitidos', () => {
    const { lines, logger } = capture();

    logger.log('info', {
      event: 'peticion.completada' as LogEvent,
      module: 'need-records',
      code: 'OK',
      correlationId: '3f2c1a9e-7b1d-4c2a-9e8f-1a2b3c4d5e6f',
      durationMs: 12,
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      time: '2026-10-12T12:00:00.000Z',
      level: 'info',
      event: 'peticion.completada' as LogEvent,
      module: 'need-records',
      code: 'OK',
      correlationId: '3f2c1a9e-7b1d-4c2a-9e8f-1a2b3c4d5e6f',
      durationMs: 12,
    });
  });

  it('descarta cualquier propiedad fuera de la allowlist, aunque llegue en tiempo de ejecución', () => {
    const { lines, logger } = capture();
    const leaked = {
      event: 'auth.login' as LogEvent,
      email: 'persona.canario@example.test',
      token: 'tok_canario_123',
      body: { grupo: 'canario-grupo' },
      url: '/api/v1/auth/callback?code=canario-codigo',
      cookie: 'sal_at=canario-cookie',
      latitude: -12.0464,
    } as unknown as LogEntry;

    logger.log('warn', leaked);

    const line = lines[0];
    expect(line).not.toContain('persona.canario@example.test');
    expect(line).not.toContain('tok_canario_123');
    expect(line).not.toContain('canario-grupo');
    expect(line).not.toContain('canario-codigo');
    expect(line).not.toContain('canario-cookie');
    expect(line).not.toContain('12.0464');
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(['event', 'level', 'time']);
  });

  it('sustituye un evento con texto libre por un valor fijo sin repetir el texto', () => {
    const { lines, logger } = capture();

    logger.log('error', { event: 'fallo para persona.canario@example.test' as LogEvent });

    expect(JSON.parse(lines[0]).event).toBe('evento_no_valido');
    expect(lines[0]).not.toContain('persona.canario');
  });

  it('descarta códigos y módulos que no siguen su formato', () => {
    const { lines, logger } = capture();

    logger.log('info', { event: 'ok' as LogEvent, module: 'Donor Records', code: 'bad code' });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.module).toBeUndefined();
    expect(parsed.code).toBeUndefined();
  });

  it('descarta un correlationId con caracteres que podrían inyectar contenido', () => {
    const { lines, logger } = capture();

    logger.log('info', { event: 'ok' as LogEvent, correlationId: 'abc\nlevel=forged' });

    expect(JSON.parse(lines[0]).correlationId).toBeUndefined();
    expect(lines[0]).not.toContain('forged');
  });

  it('acepta solo duraciones finitas y no negativas', () => {
    const { lines, logger } = capture();

    logger.log('info', { event: 'a' as LogEvent, durationMs: -1 });
    logger.log('info', { event: 'b' as LogEvent, durationMs: Number.NaN });
    logger.log('info', { event: 'c' as LogEvent, durationMs: '12' as unknown as number });

    expect(lines.map((line) => JSON.parse(line).durationMs)).toEqual([undefined, undefined, undefined]);
  });
});

describe('createLogger: estado HTTP', () => {
  it('registra solo estados HTTP válidos', () => {
    const { lines, logger } = capture();

    logger.log('warn', { event: 'seguridad.rechazo', status: 403, code: 'ACCESS_DENIED' });
    logger.log('warn', { event: 'seguridad.rechazo', status: 99999 });
    logger.log('warn', { event: 'seguridad.rechazo', status: '403' as unknown as number });

    expect(JSON.parse(lines[0]).status).toBe(403);
    expect(JSON.parse(lines[1])).not.toHaveProperty('status');
    expect(JSON.parse(lines[2])).not.toHaveProperty('status');
  });
});
