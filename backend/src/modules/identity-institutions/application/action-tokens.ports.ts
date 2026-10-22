import type { Envelope } from './institutions.ports.js';

/** `email` es solo para la aplicación (crear la cuenta del invitado); la vista previa HTTP no lo expone. */
export type AdminInvitationPreview = Readonly<{
  hospitalName: string;
  expiresAt: string;
  email: string;
  /** Usuario de Auth inerte (sin cuenta de aplicación) que ocupa el correo invitado; la aplicación puede reemplazarlo. */
  orphanUserId: string | null;
}>;

export type InviteAdminCommand = Readonly<{
  email: string;
  hospitalId: string;
  tokenHash: string;
  outboxId: string;
  sealed: string;
}>;

export type RecoveryCommand = Readonly<{
  email: string;
  tokenHash: string;
  outboxId: string;
  sealed: string;
  /** Idempotencia propia de la RPC (actor `email:<hmac>`, clave y hash de la intención). */
  actorRef: string;
  key: string;
  hash: string;
}>;

/**
 * Puerto sobre las RPC de tokens de acción (DEFINER de la allowlist de ADR-003). La vista previa, la solicitud de
 * recuperación y el consumo del reset las ejecuta la identidad técnica del backend, nunca un cliente anónimo.
 */
export interface ActionTokensRepository {
  inviteAdmin(accessToken: string, envelope: Envelope, command: InviteAdminCommand): Promise<void>;
  adminInvitationPreview(tokenHash: string): Promise<AdminInvitationPreview>;
  /** Con la sesión del propio invitado (recién creada con signUp). */
  linkAdminAccount(accessToken: string, envelope: Envelope, tokenHash: string): Promise<Readonly<{ hospitalName: string }>>;
  requestRecovery(command: RecoveryCommand): Promise<void>;
  /** Consume el token de recuperación y abre la barrera de sesión (ADR-007); devuelve el usuario y la generación abierta. */
  consumePasswordReset(tokenHash: string): Promise<Readonly<{ userId: string; generation: number }>>;
  /** Cierra la barrera de esa generación (`conflict` = un reset posterior ya abrió otra). */
  closeSessionBarrier(userId: string, generation: number): Promise<'ok' | 'conflict'>;
}
