import type { OutboxGateway } from './outbox.ports.js';
import type { OutboxProcessor } from './process-outbox.js';

export interface WorkerLoopDependencies {
  readonly processor: OutboxProcessor;
  readonly gateway: Pick<OutboxGateway, 'expire'>;
  readonly pollMs: number;
  /** Cada cuánto vencer lo pasado de not_after (por defecto 60 s). */
  readonly expireEveryMs?: number;
  readonly now?: () => number;
  /** Tarea periódica de mantenimiento (purgas). Un fallo se registra por código y no detiene el bucle. */
  readonly maintenance?: Readonly<{ run: () => Promise<unknown>; everyMs: number }>;
  /** Solo evento, código y duración: nunca destinatario, asunto ni token. */
  readonly log: (event: 'worker.ciclo' | 'worker.error', code: string, durationMs: number) => void;
}

/**
 * Bucle del worker. `tick` es una iteración (probable sin temporizadores); `start`/`stop` la repiten sin solaparse.
 * Un fallo de un ciclo se registra por código y el bucle continúa en el siguiente.
 */
export function createWorkerLoop({ processor, gateway, pollMs, expireEveryMs = 60_000, now = Date.now, log, maintenance }: WorkerLoopDependencies) {
  let lastExpire = Number.NEGATIVE_INFINITY;
  let lastMaintenance = Number.NEGATIVE_INFINITY;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let stopped = true;

  async function tick(): Promise<void> {
    const started = now();
    try {
      log('worker.ciclo', 'INICIO_PROCESAMIENTO', 0);
      const summary = await processor.runOnce();
      log('worker.ciclo', 'PROCESAMIENTO_TERMINADO', now() - started);
      if (started - lastExpire >= expireEveryMs) {
        lastExpire = started;
        await gateway.expire();
      }
      if (maintenance && started - lastMaintenance >= maintenance.everyMs) {
        lastMaintenance = started;
        await maintenance.run();
      }
      log('worker.ciclo', summary.claimed > 0 ? 'OK' : 'SIN_TRABAJO', now() - started);
    } catch {
      log('worker.error', 'INTERNAL_ERROR', now() - started);
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        await tick();
      } finally {
        running = false;
        schedule();
      }
    }, pollMs);
    timer.unref();
  }

  return Object.freeze({
    tick,
    start(): void {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  });
}
