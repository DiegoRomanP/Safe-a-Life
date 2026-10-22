import { createApp } from './app.js';
import { buildApplication } from './composition.js';
import { ConfigError, type AppConfig, parseEnv } from './config/env.js';
import { createLogger } from './shared/observability/logger.js';

const logger = createLogger((line) => process.stdout.write(`${line}\n`));

const SHUTDOWN_TIMEOUT_MS = 10_000;

// Sin mensaje ni stack: pueden contener datos de la petición (OBS-01).
for (const event of ['unhandledRejection', 'uncaughtException'] as const) {
  process.on(event, () => {
    logger.log('error', { event: 'proceso.error_no_controlado', code: 'INTERNAL_ERROR' });
    process.exit(1);
  });
}

function loadConfig(): AppConfig {
  try {
    return parseEnv(process.env, 'api');
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfig();
const application = buildApplication(config, logger);
const app = createApp({ config, logger, ...application });
const server = app.listen(config.port, () => {
  logger.log('info', { event: 'servidor.iniciado' });
});

// Límites de la conexión (slowloris y conexiones colgadas).
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(() => process.exit(0));
  });
}
