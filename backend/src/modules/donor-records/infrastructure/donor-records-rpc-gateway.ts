import { asBoolean, asNullableString, asNumber, asString, closedRecord, oneOf } from '../../../shared/persistence/guards.js';
import { pageOf } from '../../../shared/persistence/page.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type {
  AssistedSignupView, DonorRecordsRepository, OnboardingOutcome, OwnProfileView, VerifiedDonor,
} from '../application/donor-records.ports.js';

const BLOOD_TYPES = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'] as const;
const SIGNUP_STATUSES = ['pendiente', 'vencida', 'reclamada_incompleta', 'activa'] as const;

export function parseSignup(value: unknown): AssistedSignupView {
  const row = closedRecord(value, ['signupId', 'status', 'createdAt', 'activationExpiresAt', 'purgeAt']);
  return Object.freeze({
    signupId: asString(row.signupId), status: oneOf(row.status, SIGNUP_STATUSES), createdAt: asString(row.createdAt),
    activationExpiresAt: asString(row.activationExpiresAt), purgeAt: asString(row.purgeAt),
  });
}

export function parseProfile(value: unknown): OwnProfileView {
  const row = closedRecord(value, ['name', 'email', 'declaredBloodType', 'isAvailable', 'approximateLocation']);
  const location = closedRecord(row.approximateLocation, ['latitude', 'longitude']);
  return Object.freeze({
    name: asString(row.name), email: asString(row.email), declaredBloodType: oneOf(row.declaredBloodType, BLOOD_TYPES),
    isAvailable: asBoolean(row.isAvailable),
    approximateLocation: Object.freeze({ latitude: asNumber(location.latitude), longitude: asNumber(location.longitude) }),
  });
}

function parseOutcome(reply: Record<string, unknown>): OnboardingOutcome {
  const row = closedRecord(reply, ['kind', 'status', 'emailVerified']);
  if (row.emailVerified !== true) throw new TypeError('emailVerified');
  // La base habla de perfiles (`incompleto`, `activo`); el contrato, de la cuenta. Un perfil incompleto es `reclamada_incompleta`
  // en el enum del contrato (spec F5: «reclamada_incompleta = perfil incompleto»).
  const status = oneOf(row.status, ['incompleto', 'activo', 'reclamada_incompleta'] as const);
  return Object.freeze({ status: status === 'activo' ? 'activa' as const : 'reclamada_incompleta' as const, emailVerified: true as const });
}

function parseVerified(reply: Record<string, unknown>): VerifiedDonor {
  const row = closedRecord(reply, ['kind', 'status', 'emailVerified', 'userId', 'email', 'passwordSetupRequired']);
  return Object.freeze({
    outcome: parseOutcome({ kind: row.kind, status: row.status, emailVerified: row.emailVerified }),
    userId: asString(row.userId), email: asString(row.email), passwordSetupRequired: asBoolean(row.passwordSetupRequired),
  });
}

/**
 * Adaptador RPC de donantes y altas asistidas. `rpc` llama con el JWT de la persona; `technical` con la sesión técnica del
 * backend (registro, verificación, activación y cambio de correo): nombres de función y argumentos `p_*` viven solo aquí.
 */
export function createDonorRecordsRpcGateway(rpc: RpcInvoker, technical: RpcInvoker): DonorRecordsRepository {
  const repository: DonorRecordsRepository = {
    async linkDonorAccount(link) {
      await technical({
        accessToken: null, name: 'link_donor_account', okKinds: ['ok'],
        args: {
          p_user_id: link.userId, p_token_hash: link.tokenHash, p_outbox_id: link.outboxId, p_sealed: link.sealed,
          p_actor_ref: link.actorRef, p_key: link.key, p_hash: link.hash,
        },
      });
    },

    async reissueDonorVerification(command) {
      await technical({
        accessToken: null, name: 'reissue_donor_verification', okKinds: ['ok'],
        args: {
          p_email: command.email, p_token_hash: command.tokenHash, p_outbox_id: command.outboxId, p_sealed: command.sealed,
          p_actor_ref: command.actorRef, p_key: command.key, p_hash: command.hash,
        },
      });
    },

    async donorVerificationPreview(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'get_donor_verification_preview', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      return Object.freeze({ expiresAt: asString(closedRecord(reply, ['kind', 'expiresAt']).expiresAt) });
    },

    async verifyDonorEmail(tokenHash) {
      return parseVerified(await technical({ accessToken: null, name: 'verify_donor_email', okKinds: ['ok'], args: { p_token_hash: tokenHash } }));
    },

    async issuePasswordSetup(userId, issue) {
      await technical({
        accessToken: null, name: 'issue_password_setup', okKinds: ['ok'],
        args: { p_user_id: userId, p_token_hash: issue.tokenHash, p_outbox_id: issue.outboxId, p_sealed: issue.sealed },
      });
    },

    async confirmPasswordSetup(userId) {
      await technical({ accessToken: null, name: 'confirm_password_setup', okKinds: ['ok'], args: { p_user_id: userId } });
    },

    async assistedActivationPreview(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'get_assisted_activation_preview', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      const row = closedRecord(reply, ['kind', 'hospitalName', 'expiresAt', 'email', 'orphanUserId']);
      return Object.freeze({
        hospitalName: asString(row.hospitalName), expiresAt: asString(row.expiresAt), email: asString(row.email),
        orphanUserId: asNullableString(row.orphanUserId),
      });
    },

    async assistedSignupRecipient(signupId, hospitalId) {
      const reply = await technical({
        accessToken: null, name: 'get_assisted_signup_recipient', okKinds: ['ok'], args: { p_signup_id: signupId, p_hospital_id: hospitalId },
      });
      return asString(closedRecord(reply, ['kind', 'email']).email);
    },

    async linkAssistedAccount(userId, tokenHash) {
      return parseOutcome(await technical({
        accessToken: null, name: 'link_assisted_account', okKinds: ['ok'], args: { p_user_id: userId, p_token_hash: tokenHash },
      }));
    },

    async emailChangePreview(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'get_email_change_preview', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      return Object.freeze({ expiresAt: asString(closedRecord(reply, ['kind', 'expiresAt']).expiresAt) });
    },

    async consumeEmailChange(tokenHash) {
      const reply = await technical({ accessToken: null, name: 'consume_email_change', okKinds: ['ok'], args: { p_token_hash: tokenHash } });
      const row = closedRecord(reply, ['kind', 'userId', 'sealedEmail']);
      return Object.freeze({ userId: asString(row.userId), sealedEmail: asString(row.sealedEmail) });
    },

    async createAssistedSignup(accessToken, { key, hash }, command) {
      const reply = await rpc({
        accessToken, name: 'create_assisted_signup', okKinds: ['created'],
        args: { p_key: key, p_hash: hash, p_email: command.email, p_name: command.name },
      });
      return Object.freeze({ signup: parseSignup(reply.signup), seq: asNumber(reply.seq) });
    },

    async issueAssistedActivation(signupId, hospitalId, seq, issue) {
      await technical({
        accessToken: null, name: 'issue_assisted_activation', okKinds: ['ok'],
        args: {
          p_signup_id: signupId, p_hospital_id: hospitalId, p_seq: seq, p_token_hash: issue.tokenHash,
          p_outbox_id: issue.outboxId, p_sealed: issue.sealed,
        },
      });
    },

    async listAssistedSignups(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_own_assisted_signups', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseSignup);
    },

    async getAssistedSignup(accessToken, signupId) {
      const reply = await rpc({ accessToken, name: 'get_own_assisted_signup', okKinds: ['ok'], args: { p_id: signupId } });
      return parseSignup(reply.signup);
    },

    async reissueAssistedLink(accessToken, { key, hash }, signupId) {
      const reply = await rpc({ accessToken, name: 'reissue_assisted_link', okKinds: ['ok'], args: { p_key: key, p_hash: hash, p_id: signupId } });
      return Object.freeze({ seq: asNumber(reply.seq) });
    },

    async getProfile(accessToken) {
      const reply = await rpc({ accessToken, name: 'get_own_donor_profile', okKinds: ['ok'], args: {} });
      return parseProfile(reply.profile);
    },

    async completeOnboarding(accessToken, { key, hash }, input) {
      const reply = await rpc({
        accessToken, name: 'complete_own_onboarding', okKinds: ['ok'],
        args: {
          p_key: key, p_hash: hash, p_name: input.name, p_blood_type: input.declaredBloodType, p_available: input.isAvailable,
          p_latitude: input.approximateLocation.latitude, p_longitude: input.approximateLocation.longitude, p_polygon_version: input.polygonVersion,
        },
      });
      return parseProfile(reply.profile);
    },

    async updateParticipation(accessToken, { key, hash }, input) {
      const reply = await rpc({
        accessToken, name: 'update_own_participation', okKinds: ['ok'],
        args: {
          p_key: key, p_hash: hash, p_available: input.isAvailable ?? null, p_latitude: input.approximateLocation?.latitude ?? null,
          p_longitude: input.approximateLocation?.longitude ?? null, p_polygon_version: input.polygonVersion ?? null,
        },
      });
      return parseProfile(reply.profile);
    },
  };
  return repository;
}
