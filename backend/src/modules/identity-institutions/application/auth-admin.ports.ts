/**
 * Administración de Auth con `service_role` (ADR-006): exactamente cuatro métodos. Cualquier otro uso de la clave
 * elevada requiere una decisión de la persona usuaria y una revisión de seguridad.
 */
export interface AuthAdmin {
  updatePassword(userId: string, newPassword: string): Promise<void>;
  updateEmail(userId: string, newEmail: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** Elimina todas las sesiones del usuario (los refresh tokens caen en cascada). */
  revokeAllSessions(userId: string): Promise<void>;
}
