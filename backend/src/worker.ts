import { buildWorker } from './composition-worker.js';
import { ConfigError, parseWorkerEnv, type WorkerConfig } from './config/env.js';
import { createLogger } from './shared/observability/logger.js';

const logger = createLogger((line) => process.stdout.write(`${line}\n`));

// Sin mensaje ni stack: pueden contener datos del correo (OBS-01).
for (const event of ['unhandledRejection', 'uncaughtException'] as const) {
  process.on(event, () => {
    logger.log('error', { event: 'proceso.error_no_controlado', code: 'INTERNAL_ERROR' });
    process.exit(1);
  });
}

function loadConfig(): WorkerConfig {
  try {
    return parseWorkerEnv(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const worker = buildWorker(loadConfig(), logger);
worker.loop.start();
logger.log('info', { event: 'worker.iniciado' });

// Espera al ciclo en curso para que el intento de envío quede registrado; si no termina en 10 s, sale con 1 (L4).
const SHUTDOWN_TIMEOUT_MS = 10_000;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    void worker.loop.stop().then(() => process.exit(0));
  });
}
