import type { WorkerConfig } from './config/env.js';
import { createOutboxProcessor } from './modules/email-delivery/application/process-outbox.js';
import { createWorkerLoop } from './modules/email-delivery/application/worker-loop.js';
import { FakeEmailSender } from './modules/email-delivery/infrastructure/fake-sender.js';
import { createOutboxRpcGateway } from './modules/email-delivery/infrastructure/outbox-rpc-gateway.js';
import { createResendSender } from './modules/email-delivery/infrastructure/resend-sender.js';
import { createPurgeJob } from './modules/privacy-requests/application/purge-job.js';
import { createPrivacyPurgeRpcGateway } from './modules/privacy-requests/infrastructure/privacy-requests-rpc-gateway.js';
import { deriveHmacKey, hmacSha256Hex } from './shared/crypto/hmac.js';
import { createTechnicalInvoker } from './shared/persistence/technical-rpc.js';
import { createTechnicalSession } from './shared/auth/technical-session.js';
import { createSupabaseSessionGateway } from './shared/auth/supabase-session.js';
import { createRpcInvoker } from './shared/persistence/rpc-invoker.js';
import { createSupabaseFactory } from './shared/persistence/supabase-client.js';
import type { Logger } from './shared/observability/logger.js';
import type { EmailSender } from './modules/email-delivery/application/email-sender.js';

/** Las purgas no son urgentes: cada 10 minutos basta (la ventana más corta es de 15 min). */
const PURGE_EVERY_MS = 10 * 60_000;

export interface WorkerOverrides {
  /** Solo pruebas: sustituye al remitente (por ejemplo un `FakeEmailSender` programable). */
  readonly sender?: EmailSender;
  readonly random?: () => number;
}

/**
 * Raíz de composición del worker: proceso separado de la API, con la identidad técnica `worker` (V13). Solo llama a
 * las RPC `worker_*`; no usa `service_role` ni el SDK fuera de los adaptadores.
 */
export function buildWorker(config: WorkerConfig, logger: Logger, overrides: WorkerOverrides = {}) {
  const supabase = createSupabaseFactory(config);
  const sessions = createSupabaseSessionGateway(config);
  const technicalSession = createTechnicalSession({
    signIn: () => sessions.signIn(config.worker.email, config.worker.password),
    refresh: (refreshToken) => sessions.refresh(refreshToken),
  });
  const rpc = createRpcInvoker(supabase);
  const gateway = createOutboxRpcGateway(rpc, () => technicalSession.accessToken(), () => technicalSession.invalidate());
  // Purgas (F7): el ledger de eliminaciones usa su propia clave derivada. No hay adaptador que borre cuentas de Auth
  // (ADR-006 solo permite borrar usuarios inertes), así que `eraser` queda sin definir hasta que la persona usuaria decida.
  const ledgerKey = deriveHmacKey(config.secrets.emailHmac, 'deletion-ledger');
  const purge = createPurgeJob({
    repository: createPrivacyPurgeRpcGateway(createTechnicalInvoker(rpc, () => technicalSession.accessToken(), () => technicalSession.invalidate())),
    ledgerHmac: (userId) => hmacSha256Hex(ledgerKey, userId),
  });

  const sender = overrides.sender ?? (config.email.provider === 'resend'
    ? createResendSender({ apiKey: config.email.resendApiKey as string, from: config.email.from })
    : new FakeEmailSender());
  // Con Resend la allowlist falla cerrada; con el remitente falso no hay envío real que restringir (RF-EML-04).
  const inboxAllowlist = config.email.provider === 'resend' ? new Set(config.email.inboxAllowlist) : null;

  const processor = createOutboxProcessor({
    gateway, sender, keyring: config.secrets.outboxKeyring, appPublicUrl: config.appPublicUrl, inboxAllowlist,
    ...(overrides.random ? { random: overrides.random } : {}),
  });
  const loop = createWorkerLoop({
    processor, gateway, pollMs: config.worker.pollMs,
    maintenance: { run: () => purge.runOnce(), everyMs: PURGE_EVERY_MS },
    log: (event, code, durationMs) => logger.log(event === 'worker.error' ? 'error' : 'info', { event, code, durationMs }),
  });
  return Object.freeze({ processor, loop, gateway, sender, purge });
}
