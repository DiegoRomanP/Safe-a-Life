import { buildWorker } from './composition-worker.js';
import { ConfigError, parseEnv, type AppConfig } from './config/env.js';
import { createLogger } from './shared/observability/logger.js';

const logger = createLogger((line) => process.stdout.write(`${line}\n`));

// Sin mensaje ni stack: pueden contener datos del correo (OBS-01).
for (const event of ['unhandledRejection', 'uncaughtException'] as const) {
  process.on(event, () => {
    logger.log('error', { event: 'proceso.error_no_controlado', code: 'INTERNAL_ERROR' });
    process.exit(1);
  });
}

function loadConfig(): AppConfig {
  try {
    return parseEnv(process.env, 'worker');
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
void worker.loop.tick();
logger.log('info', { event: 'worker.iniciado' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    worker.loop.stop();
    process.exit(0);
  });
}
