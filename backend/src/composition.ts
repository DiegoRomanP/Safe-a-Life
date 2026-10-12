import type { Express } from 'express';
import type { AppConfig } from './config/env.js';
import { createAuthService } from './modules/identity-institutions/application/auth-service.js';
import { createIdentityGateways } from './modules/identity-institutions/infrastructure/identity-rpc-gateway.js';
import { registerAuthRoutes } from './modules/identity-institutions/http/auth.router.js';
import { registerInstitutionsRoutes } from './modules/identity-institutions/http/institutions.router.js';
import { createReadinessRpcGateway } from './modules/platform/infrastructure/readiness-rpc-gateway.js';
import { registerHealthRoutes } from './modules/platform/http/health.router.js';
import { authenticate } from './shared/auth/authenticate.js';
import { createSupabaseSessionGateway } from './shared/auth/supabase-session.js';
import { createRpcInvoker } from './shared/persistence/rpc-invoker.js';
import { EXPECTED_SCHEMA_VERSION } from './shared/persistence/schema-version.js';
import { createSupabaseFactory } from './shared/persistence/supabase-client.js';
import type { Logger } from './shared/observability/logger.js';

export interface Application {
  /** Rutas que necesitan el body crudo (webhook firmado); van antes de `express.json`. */
  readonly mountBeforeJson: (app: Express) => void;
  readonly mount: (app: Express) => void;
}

/**
 * Raíz de composición: crea adaptadores a partir de la configuración y registra
 * los routers de cada módulo. No hay barrels ni singletons de sesión; cada
 * petición crea su propio cliente de Supabase.
 */
export function buildApplication(config: AppConfig, _logger: Logger): Application {
  const supabase = createSupabaseFactory(config);
  const sessions = createSupabaseSessionGateway(config);
  const rpc = createRpcInvoker(supabase);
  const identity = createIdentityGateways(supabase);
  const auth = createAuthService(sessions, identity, { emailHmacSecret: config.secrets.emailHmac });
  const httpSecrets = {
    csrf: config.secrets.csrf,
    cursor: config.secrets.cursor,
    allowedOrigins: config.allowedOrigins,
  };

  return Object.freeze({
    mountBeforeJson: () => undefined,
    mount: (app: Express) => {
      registerHealthRoutes(app, {
        readiness: createReadinessRpcGateway(supabase),
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      });
      // Todo /api resuelve primero la sesión y el actor (membresía y rol en cada petición, SEC-07).
      app.use('/api', authenticate({ verifier: sessions, actors: identity.actors }));
      registerAuthRoutes(app, { auth, secrets: { ...httpSecrets, ipHmac: config.secrets.emailHmac } });
      registerInstitutionsRoutes(app, { rpc, secrets: httpSecrets });
    },
  });
}
