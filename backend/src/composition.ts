import type { Express } from 'express';
import type { AppConfig } from './config/env.js';
import { createAuthService } from './modules/identity-institutions/application/auth-service.js';
import { createInstitutionsService } from './modules/identity-institutions/application/institutions-service.js';
import { createInstitutionsRpcGateway } from './modules/identity-institutions/infrastructure/institutions-rpc-gateway.js';
import { createIdentityGateways } from './modules/identity-institutions/infrastructure/identity-rpc-gateway.js';
import { registerAuthRoutes } from './modules/identity-institutions/http/auth.router.js';
import { consumeAuthQuota } from './modules/identity-institutions/application/auth-quota.js';
import { authRenewalPolicy } from './modules/identity-institutions/http/renewal-policy.js';
import { registerInstitutionsRoutes } from './modules/identity-institutions/http/institutions.router.js';
import { createReadinessRpcGateway } from './modules/platform/infrastructure/readiness-rpc-gateway.js';
import { registerHealthRoutes } from './modules/platform/http/health.router.js';
import { authenticate } from './shared/auth/authenticate.js';
import { deriveHmacKeyring } from './shared/crypto/hmac.js';
import { clientIpSubject } from './shared/http/client-ip.js';
import { createSupabaseSessionGateway } from './shared/auth/supabase-session.js';
import { createRpcInvoker } from './shared/persistence/rpc-invoker.js';
import { EXPECTED_SCHEMA_VERSION } from './shared/persistence/schema-version.js';
import { createSupabaseFactory } from './shared/persistence/supabase-client.js';
import type { Logger } from './shared/observability/logger.js';

// Por IP y cada 15 min. Debe quedar muy por debajo del techo global de renovación (AUTH_QUOTA.refresh):
// con 30, al menos tres IPs deben cooperar para saturarlo (O1).
const REFRESH_LIMIT = 30;
const REFRESH_WINDOW_SECONDS = 15 * 60;

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
  const institutions = createInstitutionsService(createInstitutionsRpcGateway(rpc));
  const hmacKeys = deriveHmacKeyring(config.secrets.emailHmac);
  const ipHmac = hmacKeys.ip;
  const auth = createAuthService(sessions, identity, {
    keys: hmacKeys,
    loginFailureFloorMs: 400,
  });
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
      // La renovación de sesión pasa por un límite propio por IP: Auth limita /token por IP del backend
      // (cuota compartida) y un atacante sin cuenta podría agotarla con cookies falsas.
      app.use('/api', authenticate({
        verifier: sessions,
        actors: identity.actors,
        // Login no renueva; logout renueva si puede (para revocar) sin que un límite lo bloquee.
        renewalPolicy: authRenewalPolicy,
        refreshGate: async (req) => {
          const decision = await identity.limiter.consume('refresh:ip', clientIpSubject(req, ipHmac), REFRESH_LIMIT, REFRESH_WINDOW_SECONDS);
          if (!decision.allowed) return { retryAfterSeconds: decision.retryAfterSeconds };
          // Techo global de /token (O1): se consume solo si el límite por IP lo permitió.
          const wait = await consumeAuthQuota(identity.limiter, 'refresh');
          return wait === null ? null : { retryAfterSeconds: wait, reason: 'auth_quota_refresh' };
        },
      }));
      registerAuthRoutes(app, { auth, secrets: { ...httpSecrets, ipHmac } });
      registerInstitutionsRoutes(app, { institutions, secrets: httpSecrets });
    },
  });
}
