import type { Page, PageQuery } from '../../../shared/persistence/page.js';
import type { ApproximateLocation } from '../domain/location.js';

export type { Page, PageQuery };

/** Clave de idempotencia y hash canónico que la RPC recalcula y compara. */
export type Envelope = Readonly<{ key: string; hash: string }>;

export type OnboardingOutcome = Readonly<{ status: 'reclamada_incompleta' | 'activa'; emailVerified: true }>;

export type AssistedSignupView = Readonly<{
  signupId: string;
  status: 'pendiente' | 'vencida' | 'reclamada_incompleta' | 'activa';
  createdAt: string;
  activationExpiresAt: string;
  purgeAt: string;
}>;

export type OwnProfileView = Readonly<{
  name: string;
  email: string;
  declaredBloodType: string;
  isAvailable: boolean;
  approximateLocation: ApproximateLocation;
}>;

export type ActivationPreview = Readonly<{
  hospitalName: string;
  expiresAt: string;
  /** Solo para la aplicación (crear la cuenta de Auth); la vista previa HTTP no lo expone. */
  email: string;
  /** Usuario de Auth inerte que ocupa el correo del alta (se reemplaza al reclamar). */
  orphanUserId: string | null;
}>;

export type SignupCommand = Readonly<{ email: string; name: string | null }>;
/** Token y correo de una emisión de enlace de activación (solo los emite la sesión técnica). */
export type ActivationIssue = Readonly<{ tokenHash: string; outboxId: string; sealed: string }>;
/** Alta registrada y número de emisión de su enlace (`activation_seq`). */
export type SignupRegistered = Readonly<{ signup: AssistedSignupView; seq: number }>;
export type VerificationIssue = Readonly<{ tokenHash: string; outboxId: string; sealed: string; actorRef: string; key: string; hash: string }>;
export type RegistrationLink = VerificationIssue & Readonly<{ userId: string }>;
export type ReissueVerification = VerificationIssue & Readonly<{ email: string }>;
export type OnboardingInput = Readonly<{
  name: string; declaredBloodType: string; isAvailable: boolean; approximateLocation: ApproximateLocation; polygonVersion: string;
}>;
export type ParticipationInput = Readonly<{ isAvailable?: boolean; approximateLocation?: ApproximateLocation; polygonVersion?: string }>;

/**
 * Puerto sobre las RPC de donantes y altas asistidas. Las que reciben un id de usuario o un hash de token (registro,
 * verificación, activación, cambio de correo) las ejecuta la sesión técnica del backend; el resto, el JWT de la persona.
 */
export interface DonorRecordsRepository {
  linkDonorAccount(link: RegistrationLink): Promise<void>;
  /** Reenvía la verificación de un registro sin verificar (respuesta idéntica en cualquier otro caso). */
  reissueDonorVerification(command: ReissueVerification): Promise<void>;
  donorVerificationPreview(tokenHash: string): Promise<Readonly<{ expiresAt: string }>>;
  verifyDonorEmail(tokenHash: string): Promise<OnboardingOutcome>;
  assistedActivationPreview(tokenHash: string): Promise<ActivationPreview>;
  /** Correo de un alta reemitible del hospital indicado (solo para sellar el correo; nunca se devuelve por HTTP). */
  assistedSignupRecipient(signupId: string, hospitalId: string): Promise<string>;
  linkAssistedAccount(userId: string, tokenHash: string): Promise<OnboardingOutcome>;
  emailChangePreview(tokenHash: string): Promise<Readonly<{ expiresAt: string }>>;
  consumeEmailChange(tokenHash: string): Promise<Readonly<{ userId: string; sealedEmail: string }>>;

  /** Registra el alta (sesión del admin); el token y el correo los emite `issueAssistedActivation`. */
  createAssistedSignup(accessToken: string, envelope: Envelope, command: SignupCommand): Promise<SignupRegistered>;
  /** Emite el token y el correo de la emisión `seq` del alta (sesión técnica; idempotente por alta y emisión). */
  issueAssistedActivation(signupId: string, hospitalId: string, seq: number, issue: ActivationIssue): Promise<void>;
  listAssistedSignups(accessToken: string, query: PageQuery): Promise<Page<AssistedSignupView>>;
  getAssistedSignup(accessToken: string, signupId: string): Promise<AssistedSignupView>;
  reissueAssistedLink(accessToken: string, envelope: Envelope, signupId: string): Promise<Readonly<{ seq: number }>>;

  getProfile(accessToken: string): Promise<OwnProfileView>;
  completeOnboarding(accessToken: string, envelope: Envelope, input: OnboardingInput): Promise<OwnProfileView>;
  updateParticipation(accessToken: string, envelope: Envelope, input: ParticipationInput): Promise<OwnProfileView>;
}
