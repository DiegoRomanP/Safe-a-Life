import type { Page, PageQuery } from '../../../shared/persistence/page.js';

export type { Page, PageQuery };

/** Clave de idempotencia y hash canónico que la RPC recalcula (o, si lleva datos cifrados, solo compara). */
export type Envelope = Readonly<{ key: string; hash: string }>;

export const REQUEST_STATUSES = ['pendiente', 'aprobada', 'rechazada', 'en_ejecucion', 'completada', 'fallida'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestType = 'correccion' | 'eliminacion';
export type RequestedField = 'name' | 'email' | 'declaredBloodType' | 'deletion';
export type GrantField = Exclude<RequestedField, 'deletion'>;

/** Proyección sin valores personales ni identificador de donante (`CorrectionRequestSummary`). */
export type CorrectionRequestView = Readonly<{
  requestId: string;
  type: RequestType;
  requestedFields: readonly RequestedField[];
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  decisionReason?: string;
}>;

export type NewCorrection = Readonly<{
  requestId: string;
  type: RequestType;
  name: string | null;
  /** Correo propuesto, ya cifrado (contexto = `requestId`). */
  emailSealed: string | null;
  declaredBloodType: string | null;
}>;

export type GrantAction = 'review' | 'execute';
export type NewGrant = Readonly<{ requestId: string; action: GrantAction; allowedFields: readonly GrantField[]; reason: string }>;
export type GrantView = Readonly<{ grantId: string; requestId: string; action: GrantAction; allowedFields: readonly GrantField[]; expiresAt: string }>;

export type ContextualData = Readonly<{
  currentValues: Readonly<Partial<Record<GrantField, string>>>;
  /** El correo propuesto llega cifrado en `proposedEmailSealed`; los demás valores, en claro. */
  proposedValues: Readonly<Partial<Record<GrantField, string>>>;
  proposedEmailSealed?: string;
}>;

export type ExecutionStarted = Readonly<{ request: CorrectionRequestView; next: 'none' | 'email' | 'deletion' }>;
export type ExecutionSubject = Readonly<{ type: RequestType; donorId?: string; proposedEmailSealed?: string }>;
export type EmailChangeIssue = Readonly<{ tokenHash: string; sealedEmail: string; outboxId: string; sealedPayload: string }>;

/** Lo que el worker debe terminar fuera de la base tras `worker_purge_expired`. */
export type PurgeReport = Readonly<{
  purged: Readonly<Record<string, number>>;
  failedRequests: number;
  staleAccounts: readonly string[];
  pendingDeletions: ReadonlyArray<Readonly<{ requestId: string; donorId: string }>>;
}>;

/**
 * Puerto sobre las RPC de solicitudes de privacidad. Las que recibe la persona usuaria van con su JWT; las que cierran una
 * ejecución (`executionSubject` en adelante) las ejecuta la sesión técnica del backend, y `purge`, la del worker.
 */
export interface PrivacyRequestsRepository {
  createOwn(accessToken: string, envelope: Envelope, input: NewCorrection): Promise<CorrectionRequestView>;
  listOwn(accessToken: string, query: PageQuery): Promise<Page<CorrectionRequestView>>;
  getOwn(accessToken: string, requestId: string): Promise<CorrectionRequestView>;

  list(accessToken: string, query: PageQuery): Promise<Page<CorrectionRequestView>>;
  get(accessToken: string, requestId: string): Promise<CorrectionRequestView>;
  decide(accessToken: string, envelope: Envelope, requestId: string, decision: 'aprobada' | 'rechazada', reason: string): Promise<CorrectionRequestView>;

  createGrant(accessToken: string, envelope: Envelope, grant: NewGrant): Promise<GrantView>;
  contextualData(accessToken: string, requestId: string, grantId: string): Promise<ContextualData>;
  execute(accessToken: string, envelope: Envelope, requestId: string, grantId: string): Promise<ExecutionStarted>;

  executionSubject(requestId: string): Promise<ExecutionSubject>;
  issueEmailChange(requestId: string, issue: EmailChangeIssue): Promise<void>;
  finishDeletion(requestId: string, subjectHmac: string): Promise<void>;
  failExecution(requestId: string): Promise<void>;
}

/** Operaciones del worker sobre las solicitudes (sesión del worker). */
export interface PrivacyPurgeRepository {
  purge(): Promise<PurgeReport>;
  finishDeletion(requestId: string, subjectHmac: string): Promise<void>;
  failExecution(requestId: string): Promise<void>;
}

/**
 * Borra la cuenta de Auth de una persona (eliminación, V15) y devuelve cuando ya no existe. No tiene adaptador de producción:
 * `AuthAdmin` (ADR-006) solo permite borrar usuarios inertes, y ampliarlo es una decisión de la persona usuaria.
 */
export interface AccountEraser {
  deleteAccount(userId: string): Promise<void>;
}
