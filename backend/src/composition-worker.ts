import type { AppConfig } from './config/env.js';
import { createOutboxProcessor } from './modules/email-delivery/application/process-outbox.js';
import { createWorkerLoop } from './modules/email-delivery/application/worker-loop.js';
import { FakeEmailSender } from './modules/email-delivery/infrastructure/fake-sender.js';
import { createOutboxRpcGateway } from './modules/email-delivery/infrastructure/outbox-rpc-gateway.js';
import { createResendSender } from './modules/email-delivery/infrastructure/resend-sender.js';
import { createTechnicalSession } from './shared/auth/technical-session.js';
import { createSupabaseSessionGateway } from './shared/auth/supabase-session.js';
import { createRpcInvoker } from './shared/persistence/rpc-invoker.js';
import { createSupabaseFactory } from './shared/persistence/supabase-client.js';
import type { Logger } from './shared/observability/logger.js';
import type { EmailSender } from './modules/email-delivery/application/email-sender.js';

export interface WorkerOverrides {
  /** Solo pruebas: sustituye al remitente (por ejemplo un `FakeEmailSender` programable). */
  readonly sender?: EmailSender;
  readonly random?: () => number;
}

/**
 * Raíz de composición del worker: proceso separado de la API, con la identidad técnica `worker` (V13). Solo llama a
 * las RPC `worker_*`; no usa `service_role` ni el SDK fuera de los adaptadores.
 */
export function buildWorker(config: AppConfig, logger: Logger, overrides: WorkerOverrides = {}) {
  const supabase = createSupabaseFactory(config);
  const sessions = createSupabaseSessionGateway(config);
  const technicalSession = createTechnicalSession({
    signIn: () => sessions.signIn(config.worker.email, config.worker.password),
    refresh: (refreshToken) => sessions.refresh(refreshToken),
  });
  const gateway = createOutboxRpcGateway(createRpcInvoker(supabase), () => technicalSession.accessToken(), () => technicalSession.invalidate());

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
    log: (event, code, durationMs) => logger.log(event === 'worker.error' ? 'error' : 'info', { event, code, durationMs }),
  });
  return Object.freeze({ processor, loop, gateway, sender });
}
