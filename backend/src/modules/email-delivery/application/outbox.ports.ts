import type { EmailKind } from '../templates/index.js';

export type ClaimedMessage = Readonly<{
  outboxId: string;
  kind: EmailKind;
  sealedPayload: string;
  attemptNo: number;
  idempotencyKey: string;
  /** Correo de `auth.users` cuando el outbox tiene `recipient_user_id`; si no, el destinatario va en el payload. */
  recipient: string | null;
}>;

export type AttemptRecord = Readonly<{
  outboxId: string;
  attemptNo: number;
  outcome: 'ok' | 'transitorio' | 'permanente' | 'incierto';
  httpStatus: number | null;
  providerMessageId: string | null;
  nextAttemptAt: Date | null;
}>;

export type ProviderEvent = Readonly<{ eventId: string; providerMessageId: string; type: string; occurredAt: Date }>;

/** Puerto sobre las RPC DEFINER del worker. Todo acto exige la identidad técnica con rol `worker` (V13). */
export interface OutboxGateway {
  claim(limit: number): Promise<readonly ClaimedMessage[]>;
  /** `false` si el intento quedó obsoleto (otro worker reclamó la fila): no es un error. */
  recordAttempt(record: AttemptRecord): Promise<boolean>;
  expire(): Promise<Readonly<{ expired: number; exhausted: number }>>;
  ingestEvent(event: ProviderEvent): Promise<Readonly<{ duplicate: boolean; matched: boolean }>>;
}
