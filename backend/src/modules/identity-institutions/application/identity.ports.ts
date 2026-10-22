import type { ActorResolver } from '../../../shared/auth/session-ports.js';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Contadores atómicos compartidos en PostgreSQL (SEC-15). `subject` ya es un HMAC. */
export interface RateLimiter {
  consume(bucket: string, subject: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}

export type KeyOutcome = 'ok' | 'payload_conflict' | 'in_progress' | 'conflict' | 'invalid';

/** Idempotencia previa a la sesión (login): actor `email:<hmac>`. */
export interface PublicIdempotency {
  record(actorRef: string, operation: string, key: string, hash: string): Promise<KeyOutcome>;
}

/** Clave de un solo uso para operaciones sensibles con sesión (MFA, step-up). */
export interface UserKeyGuard {
  consume(accessToken: string, operation: string, key: string, hash: string): Promise<KeyOutcome>;
}

/** Barrera de sesión (ADR-007): el ticket se emite ANTES de `signIn` y captura la generación de ese momento. */
export interface SessionAdmission {
  issueLoginTicket(email: string): Promise<string>;
  /** `false` = rechazada (ticket de otra generación, con barrera abierta, caducado, ajeno o reutilizado). */
  admitSession(ticketId: string, userId: string, sessionId: string): Promise<boolean>;
}

export type IdentityDependencies = Readonly<{
  actors: ActorResolver;
  admission: SessionAdmission;
  limiter: RateLimiter;
  publicKeys: PublicIdempotency;
  userKeys: UserKeyGuard;
}>;
