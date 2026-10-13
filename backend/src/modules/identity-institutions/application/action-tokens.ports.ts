import type { Envelope } from './institutions.ports.js';

/** `email` es solo para la aplicación (crear la cuenta del invitado); la vista previa HTTP no lo expone. */
export type AdminInvitationPreview = Readonly<{ hospitalName: string; expiresAt: string; email: string }>;

export type InviteAdminCommand = Readonly<{
  email: string;
  hospitalId: string;
  tokenHash: string;
  outboxId: string;
  sealed: string;
}>;

export type RecoveryCommand = Readonly<{ email: string; tokenHash: string; outboxId: string; sealed: string }>;

/** Puerto sobre las RPC de tokens de acción (DEFINER de la allowlist de ADR-003). */
export interface ActionTokensRepository {
  inviteAdmin(accessToken: string, envelope: Envelope, command: InviteAdminCommand): Promise<void>;
  adminInvitationPreview(tokenHash: string): Promise<AdminInvitationPreview>;
  /** Con la sesión del propio invitado (recién creada con signUp). */
  linkAdminAccount(accessToken: string, envelope: Envelope, tokenHash: string): Promise<Readonly<{ hospitalName: string }>>;
  requestRecovery(command: RecoveryCommand): Promise<void>;
  /** Consume el token de recuperación y devuelve el usuario al que cambiar la contraseña. */
  consumePasswordReset(tokenHash: string): Promise<Readonly<{ userId: string }>>;
}
