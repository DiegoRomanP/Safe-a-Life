import type { NeedDraftOwner, NeedDraftProjection, NormalizedNeedDraftInput } from '../domain/need-draft.js';

/** Puertos privados del caso de uso «crear necesidad en borrador» (spec A2 §3.2). No son una API HTTP. */
export type HospitalMembershipSnapshot = Readonly<{
  hospitalId: string;
  isActive: boolean;
  hospitalIsActive: boolean;
}>;

export type ValidatedNeedDraftPrincipal = Readonly<{
  actorId: string;
  role: 'donante' | 'admin_hospitalario' | 'superadmin';
  aal: 'aal1' | 'aal2';
  membership: HospitalMembershipSnapshot | null;
}>;

/** `principal: null` = autenticación ausente, inválida o vencida. */
export type CreateNeedDraftContext = Readonly<{
  principal: ValidatedNeedDraftPrincipal | null;
}>;

export type CreateNeedDraftIdempotency = Readonly<{ key: unknown }>;

export type NeedDraftFailureCode =
  | 'BAD_REQUEST' | 'AUTHENTICATION_REQUIRED' | 'ACCESS_DENIED'
  | 'STATE_CONFLICT' | 'VALIDATION_FAILED' | 'INTERNAL_ERROR';

export type CreateNeedDraftResult =
  | Readonly<{ ok: true; outcome: 'created' | 'replayed'; need: NeedDraftProjection }>
  | Readonly<{ ok: false; code: NeedDraftFailureCode }>;

export type AtomicNeedDraftCommand = Readonly<{
  input: NormalizedNeedDraftInput;
  owner: NeedDraftOwner;
  idempotency: Readonly<{
    operation: 'createHospitalNeed';
    key: string;
    payloadHash: string;
  }>;
}>;

export type AtomicNeedDraftReply =
  | Readonly<{ kind: 'created' | 'replayed'; owner: NeedDraftOwner; need: NeedDraftProjection }>
  | Readonly<{ kind: 'unauthenticated' | 'forbidden' | 'site_unusable' | 'payload_conflict' | 'in_progress' | 'failed' }>;

/**
 * Una sola operación atómica: revalida identidad y membresía, reclama la clave y confirma necesidad,
 * resultado idempotente y auditoría. Devuelve `unknown`: el servicio valida la respuesta en runtime.
 */
export interface AtomicNeedDraftGateway {
  createDraft(command: AtomicNeedDraftCommand): Promise<unknown>;
}
