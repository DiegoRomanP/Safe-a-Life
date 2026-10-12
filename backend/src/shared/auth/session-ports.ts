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
