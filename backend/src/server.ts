import { createApp } from './app.js';
import { ConfigError, type AppConfig, parseEnv } from './config/env.js';
import { createLogger } from './shared/observability/logger.js';

const logger = createLogger((line) => process.stdout.write(`${line}\n`));

function loadConfig(): AppConfig {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfig();
const app = createApp({ config, logger });
const server = app.listen(config.port, () => {
  logger.log('info', { event: 'servidor.iniciado' });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
