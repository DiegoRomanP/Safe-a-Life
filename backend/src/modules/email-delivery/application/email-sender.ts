import type { OutcomeClass } from '../domain/retry-policy.js';

export type EmailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Misma clave en todos los reintentos del mismo outbox: el proveedor deduplica el envío. */
  idempotencyKey: string;
}>;

export type SendResult = Readonly<{
  kind: OutcomeClass;
  providerMessageId?: string;
  httpStatus?: number;
}>;

/** Puerto de envío (ADR-001). Nunca lanza: todo fallo se clasifica en un `SendResult`. */
export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}
