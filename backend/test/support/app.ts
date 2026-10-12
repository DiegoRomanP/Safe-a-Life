import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app.js';
import { buildApplication } from '../../src/composition.js';
import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/observability/logger.js';
import { backendEnvFor, readLocalSupabase } from './local-env.js';

export interface RunningBackend {
  readonly baseUrl: string;
  /** Todas las líneas de log emitidas, para pruebas de canarios (OBS-01). */
  readonly logLines: string[];
  close(): Promise<void>;
}

/** Levanta el backend real en proceso contra el Supabase local, en un puerto efímero. */
export async function startBackend(overrides: Record<string, string> = {}): Promise<RunningBackend> {
  const local = readLocalSupabase();
  // TRUSTED_PROXIES=1: cada cliente de prueba se identifica con su propio X-Forwarded-For.
  const config = parseEnv(backendEnvFor(local, { TRUSTED_PROXIES: '1', ...overrides }));
  const logLines: string[] = [];
  const logger = createLogger((line) => logLines.push(line));
  const app = createApp({ config, logger, ...buildApplication(config, logger) });
  const server: Server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    logLines,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
