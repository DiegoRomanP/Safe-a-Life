/**
 * Administración de Auth con `service_role` (ADR-006): exactamente cuatro métodos. Cualquier otro uso de la clave
 * elevada requiere una decisión de la persona usuaria y una revisión de seguridad.
 */
export interface AuthAdmin {
  updatePassword(userId: string, newPassword: string): Promise<void>;
  updateEmail(userId: string, newEmail: string): Promise<void>;
  /**
   * Elimina el usuario SOLO si, de forma atómica, su correo coincide, no tiene cuenta de aplicación y tiene al menos
   * `minAgeSeconds` de antigüedad. Devuelve `false` si no se cumplió (nunca borra una cuenta con vida propia).
   */
  deleteInertUser(userId: string, email: string, minAgeSeconds: number): Promise<boolean>;
  /** Elimina todas las sesiones del usuario (los refresh tokens caen en cascada). */
  revokeAllSessions(userId: string): Promise<void>;
}
