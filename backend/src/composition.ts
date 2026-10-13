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
import { createNeedDraftService } from './modules/need-records/application/create-need-draft.js';
import { createNeedsService } from './modules/need-records/application/needs-service.js';
import { createNeedsRpcGateway } from './modules/need-records/infrastructure/needs-rpc-gateway.js';
import { createActionTokensService } from './modules/identity-institutions/application/action-tokens-service.js';
import { createActionTokensRpcGateway } from './modules/identity-institutions/infrastructure/action-tokens-rpc-gateway.js';
import { createSupabaseAuthAdmin } from './modules/identity-institutions/infrastructure/supabase-auth-admin.js';
import { registerActionTokenRoutes } from './modules/identity-institutions/http/action-tokens.router.js';
import { sealEmailPayload } from './modules/email-delivery/application/email-payload.js';
import { createDonorRecordsService } from './modules/donor-records/application/donor-records-service.js';
import { createDonorRecordsRpcGateway } from './modules/donor-records/infrastructure/donor-records-rpc-gateway.js';
import { registerDonorRecordsRoutes } from './modules/donor-records/http/donor-records.router.js';
import { openEmailChange } from './modules/donor-records/application/email-change.js';
import { registerNeedsRoutes } from './modules/need-records/http/needs.router.js';
import { createWebhookIngester } from './modules/email-delivery/application/ingest-webhook.js';
import { createOutboxRpcGateway } from './modules/email-delivery/infrastructure/outbox-rpc-gateway.js';
import { registerResendWebhookRoutes } from './modules/email-delivery/http/resend-webhook.router.js';
import { createTechnicalInvoker } from './shared/persistence/technical-rpc.js';
import { createTechnicalSession } from './shared/auth/technical-session.js';
import { createReadinessRpcGateway } from './modules/platform/infrastructure/readiness-rpc-gateway.js';
import { registerHealthRoutes } from './modules/platform/http/health.router.js';
import { authenticate } from './shared/auth/authenticate.js';
import { deriveHmacKeyring } from './shared/crypto/hmac.js';
import { clientIpSubject } from './shared/http/client-ip.js';
import { createSupabaseSessionGateway } from './shared/auth/supabase-session.js';
import { callRpc } from './shared/persistence/rpc.js';
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
  const needsGateway = createNeedsRpcGateway({
    rpc,
    raw: (accessToken, name, args) => callRpc(supabase.forUser(accessToken), name, args),
  });
  const needs = createNeedsService(needsGateway.repository);
  const institutionsRepository = createInstitutionsRpcGateway(rpc);
  const institutions = createInstitutionsService(institutionsRepository);
  const hmacKeys = deriveHmacKeyring(config.secrets.emailHmac);
  const ipHmac = hmacKeys.ip;
  const auth = createAuthService(sessions, identity, {
    keys: hmacKeys,
    loginFailureFloorMs: 400,
  });
  // Sesión técnica de la API (rol `api_technical`): la usan el webhook firmado y las RPC públicas de tokens de acción, que el
  // cliente anónimo no puede ejecutar. No es la del worker: la API no puede operar el outbox (F4 M-2).
  const technicalSession = createTechnicalSession({
    signIn: () => sessions.signIn(config.apiTechnical.email, config.apiTechnical.password),
    refresh: (refreshToken) => sessions.refresh(refreshToken),
  });
  const technicalRpc = createTechnicalInvoker(rpc, () => technicalSession.accessToken(), () => technicalSession.invalidate());
  const webhookIngester = config.email.resendWebhookSecret === undefined
    ? undefined
    : createWebhookIngester({
      gateway: createOutboxRpcGateway(rpc, () => technicalSession.accessToken(), () => technicalSession.invalidate()),
      secret: config.email.resendWebhookSecret,
    });

  const authAdmin = createSupabaseAuthAdmin(config);
  const donorRepository = createDonorRecordsRpcGateway(rpc, technicalRpc);
  const actionTokens = createActionTokensService({
    onPasswordChanged: (userId) => donorRepository.confirmPasswordSetup(userId),
    repository: createActionTokensRpcGateway(rpc, technicalRpc),
    sessions,
    admin: authAdmin,
    limiter: identity.limiter,
    keys: hmacKeys,
    seal: (outboxId, payload) => sealEmailPayload(config.secrets.outboxKeyring, outboxId, payload),
    hospitalName: async (accessToken, hospitalId) => (await institutionsRepository.getHospital(accessToken, hospitalId)).publicName,
  });
  const donors = createDonorRecordsService({
    repository: donorRepository,
    sessions,
    admin: authAdmin,
    limiter: identity.limiter,
    keys: hmacKeys,
    seal: (outboxId, payload) => sealEmailPayload(config.secrets.outboxKeyring, outboxId, payload),
    open: (context, sealed) => openEmailChange(config.secrets.outboxKeyring, context, sealed),
  });
  const httpSecrets = {
    csrf: config.secrets.csrf,
    cursor: config.secrets.cursor,
    allowedOrigins: config.allowedOrigins,
  };

  return Object.freeze({
    // Rutas con cuerpo crudo (webhook firmado): van antes de `express.json`.
    mountBeforeJson: (app: Express) => {
      if (webhookIngester) registerResendWebhookRoutes(app, { ingester: webhookIngester });
    },
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
      registerActionTokenRoutes(app, { tokens: actionTokens, secrets: { ...httpSecrets, ipHmac } });
      registerDonorRecordsRoutes(app, { donors, secrets: { ...httpSecrets, ipHmac } });
      registerNeedsRoutes(app, {
        needs,
        createDraft: (accessToken) => createNeedDraftService(needsGateway.draftGatewayFor(accessToken)),
        secrets: httpSecrets,
      });
    },
  });
}
