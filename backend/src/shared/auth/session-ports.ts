export type TokenPair = Readonly<{ accessToken: string; refreshToken: string; expiresIn: number }>;

export type VerifiedClaims = Readonly<{
  userId: string;
  sessionId: string;
  aal: 'aal1' | 'aal2';
  amr: readonly Readonly<{ method: string; timestamp: number }>[];
}>;

/** Resultado de `api.current_actor()`: rol, nombre visible y membresía vigente, resueltos en cada petición (SEC-07). */
export type ActorInfo = Readonly<{
  role: 'donante' | 'admin_hospitalario' | 'superadmin';
  displayName: string;
  hospital: Readonly<{
    hospitalId: string;
    hospitalName: string;
    membershipActive: boolean;
    hospitalAuthorized: boolean;
  }> | null;
}>;

/** Puerto sobre Supabase Auth con la anon key (ADR-004). */
export interface SessionVerifier {
  /** Valida firma, emisor y vigencia. `null` si el token no es válido. */
  verifyAccessToken(accessToken: string): Promise<VerifiedClaims | null>;
  /** Renueva con el refresh token (rotativo). `null` si ya no es válido. */
  refresh(refreshToken: string): Promise<TokenPair | null>;
}

export interface ActorResolver {
  /** `null` si el usuario no tiene cuenta de aplicación (`app.user_accounts`). */
  currentActor(accessToken: string): Promise<ActorInfo | null>;
}

export type TotpEnrollment = Readonly<{ factorId: string; otpauthUri: string }>;

export type MfaFactorSummary = Readonly<{ factorId: string; verified: boolean }>;

/**
 * Operaciones de Supabase Auth con la anon key. `null` = credenciales, código o
 * reto inválidos; un fallo de red o 5xx lanza PersistenceUnavailableError.
 */
/** Resultado de `signUp`: tokens, `exists` si el correo ya tiene cuenta de Auth, o `null` si no se creó sesión. */
export type SignUpResult = TokenPair | 'exists' | null;

export interface SessionGateway extends SessionVerifier {
  /** Crea una cuenta de Auth con la anon key (reclamo de invitaciones); con confirmación de correo desactivada devuelve sesión. */
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<TokenPair | null>;
  /**
   * Revoca sesiones: `global` = todas las del usuario (V4: logout y recuperación); `local` = solo la
   * sesión de ese token (para descartar un login que no llegó a completarse).
   */
  signOut(accessToken: string, scope?: 'global' | 'local'): Promise<void>;
  /** Como máximo un factor TOTP por usuario (config.toml: max_enrolled_factors = 1). */
  listTotpFactors(tokens: TokenPair): Promise<readonly MfaFactorSummary[]>;
  /** Elimina un factor pendiente de verificación (para poder re-enrolar). */
  unenrollFactor(tokens: TokenPair, factorId: string): Promise<void>;
  enrollTotp(tokens: TokenPair): Promise<TotpEnrollment | null>;
  /** Devuelve el id del reto, o `null` si no se pudo crear. */
  challenge(tokens: TokenPair, factorId: string): Promise<string | null>;
  /** Verifica el código de un reto y devuelve los tokens elevados a AAL2. */
  verify(tokens: TokenPair, factorId: string, challengeId: string, code: string): Promise<TokenPair | null>;
  challengeAndVerify(tokens: TokenPair, factorId: string, code: string): Promise<TokenPair | null>;
}
