import { randomUUID } from 'node:crypto';
import { fingerprint } from '../../../shared/crypto/fingerprint.js';
import { generateActionToken, hashToken } from '../../../shared/crypto/tokens.js';
import { ApiError } from '../../../shared/http/errors.js';
import type { SealEmail } from '../../identity-institutions/application/action-tokens-service.js';
import type {
  AccountEraser, ContextualData, CorrectionRequestView, GrantAction, GrantField, GrantView, Page, PageQuery, PrivacyRequestsRepository,
} from './privacy-requests.ports.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

export type CorrectionInput =
  | Readonly<{ type: 'correccion'; changes: Readonly<{ name?: string; newEmail?: string; declaredBloodType?: string }> }>
  | Readonly<{ type: 'eliminacion' }>;

export type ContextualView = Readonly<{
  currentValues: Readonly<Partial<Record<GrantField, string>>>;
  proposedValues: Readonly<Partial<Record<GrantField, string>>>;
}>;

export interface PrivacyRequestsServiceDependencies {
  readonly repository: PrivacyRequestsRepository;
  /** Cifra/descifra el correo propuesto con un contexto (el id de la solicitud o el hash del token). Lanza si no puede. */
  readonly sealEmailValue: (context: string, email: string) => string;
  readonly openEmailValue: (context: string, sealed: string) => string;
  /** Cifra el payload del correo del outbox. */
  readonly seal: SealEmail;
  /** HMAC del id de la persona eliminada para el ledger (V15). */
  readonly ledgerHmac: (userId: string) => string;
  /** Sin adaptador de producción (ADR-006): sin él, una eliminación se rechaza antes de tocar nada. */
  readonly eraser?: AccountEraser;
  readonly newToken?: () => string;
  readonly newId?: () => string;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ApiError('VALIDATION_FAILED');
  return trimmed;
}

/**
 * Casos de uso de solicitudes de corrección y eliminación (F7). Los valores propuestos nunca salen de la base en claro: el
 * correo viaja cifrado y solo se abre aquí. El donante y el rol salen de la sesión, jamás de la petición.
 */
export function createPrivacyRequestsService({
  repository, sealEmailValue, openEmailValue, seal, ledgerHmac, eraser, newToken = generateActionToken, newId = randomUUID,
}: PrivacyRequestsServiceDependencies) {
  /** Cierra una eliminación una vez borrada la cuenta; es idempotente en la base. */
  const finishDeletion = async (requestId: string, donorId: string): Promise<void> => {
    await repository.finishDeletion(requestId, ledgerHmac(donorId));
  };

  return Object.freeze({
    // --- Donante ---------------------------------------------------------------------------------------------------

    async createOwn(accessToken: string, key: string, input: CorrectionInput): Promise<CorrectionRequestView> {
      const requestId = newId();
      let name: string | null = null;
      let email: string | null = null;
      let bloodType: string | null = null;
      if (input.type === 'correccion') {
        name = input.changes.name === undefined ? null : cleanName(input.changes.name);
        email = input.changes.newEmail === undefined ? null : normalizeEmail(input.changes.newEmail);
        bloodType = input.changes.declaredBloodType ?? null;
        if (email !== null && !EMAIL.test(email)) throw new ApiError('VALIDATION_FAILED');
        if (name === null && email === null && bloodType === null) throw new ApiError('VALIDATION_FAILED');
      }
      const hash = fingerprint([['type', input.type], ['name', name], ['newEmail', email], ['declaredBloodType', bloodType]]);
      let emailSealed: string | null = null;
      if (email !== null) {
        try {
          emailSealed = sealEmailValue(requestId, email);
        } catch {
          throw new ApiError('INTERNAL_ERROR');
        }
      }
      return repository.createOwn(accessToken, { key, hash }, { requestId, type: input.type, name, emailSealed, declaredBloodType: bloodType });
    },

    listOwn: (accessToken: string, query: PageQuery): Promise<Page<CorrectionRequestView>> => repository.listOwn(accessToken, query),
    getOwn: (accessToken: string, requestId: string): Promise<CorrectionRequestView> => repository.getOwn(accessToken, requestId),

    // --- Superadmin --------------------------------------------------------------------------------------------------

    list: (accessToken: string, query: PageQuery): Promise<Page<CorrectionRequestView>> => repository.list(accessToken, query),
    get: (accessToken: string, requestId: string): Promise<CorrectionRequestView> => repository.get(accessToken, requestId),

    decide(accessToken: string, key: string, requestId: string, decision: 'aprobada' | 'rechazada', reason: string): Promise<CorrectionRequestView> {
      const trimmed = reason.trim();
      if (trimmed.length === 0) throw new ApiError('VALIDATION_FAILED');
      const hash = fingerprint([['requestId', requestId], ['decision', decision], ['reason', trimmed]]);
      return repository.decide(accessToken, { key, hash }, requestId, decision, trimmed);
    },

    createGrant(
      accessToken: string, key: string, input: Readonly<{ requestId: string; action: GrantAction; allowedFields: readonly GrantField[]; reason: string }>,
    ): Promise<GrantView> {
      const reason = input.reason.trim();
      if (reason.length === 0) throw new ApiError('VALIDATION_FAILED');
      const allowedFields = [...new Set(input.allowedFields)].sort();
      // El orden y la unión por comas son los de la RPC (`allowedFields` ordenado y separado por comas).
      const hash = fingerprint([['requestId', input.requestId], ['action', input.action], ['allowedFields', allowedFields.join(',')], ['reason', reason]]);
      return repository.createGrant(accessToken, { key, hash }, { requestId: input.requestId, action: input.action, allowedFields, reason });
    },

    async contextualData(accessToken: string, requestId: string, grantId: string): Promise<ContextualView> {
      const data: ContextualData = await repository.contextualData(accessToken, requestId, grantId);
      if (data.proposedEmailSealed === undefined) return Object.freeze({ currentValues: data.currentValues, proposedValues: data.proposedValues });
      let email: string;
      try {
        email = openEmailValue(requestId, data.proposedEmailSealed);
      } catch {
        throw new ApiError('INTERNAL_ERROR');
      }
      return Object.freeze({ currentValues: data.currentValues, proposedValues: Object.freeze({ ...data.proposedValues, email }) });
    },

    /**
     * Ejecuta una solicitud aprobada. La base aplica lo que puede (perfil) y deja `en_ejecucion` lo que depende de otro paso:
     * el correo (enlace al buzón nuevo, lo cierra F5 al verificarlo) o el borrado de la cuenta. Un replay repite el paso de
     * cierre, que es idempotente.
     */
    async execute(accessToken: string, key: string, requestId: string, grantId: string): Promise<CorrectionRequestView> {
      // Sin quien borre cuentas, una eliminación se rechaza antes de tocar nada.
      if (eraser === undefined && (await repository.get(accessToken, requestId)).type === 'eliminacion') throw new ApiError('SERVICE_UNAVAILABLE');
      const hash = fingerprint([['requestId', requestId], ['grantId', grantId]]);
      const started = await repository.execute(accessToken, { key, hash }, requestId, grantId);
      if (started.next === 'none') return started.request;

      let subject;
      try {
        subject = await repository.executionSubject(requestId);
      } catch (error) {
        // Ya cerrada (replay posterior al cierre): se devuelve el estado actual.
        if (error instanceof ApiError && error.code === 'STATE_CONFLICT') return repository.get(accessToken, requestId);
        throw error;
      }

      if (started.next === 'email') {
        if (subject.proposedEmailSealed === undefined) throw new ApiError('INTERNAL_ERROR');
        let email: string;
        try {
          email = openEmailValue(requestId, subject.proposedEmailSealed);
        } catch {
          throw new ApiError('INTERNAL_ERROR');
        }
        const token = newToken();
        const tokenHash = hashToken(token);
        const outboxId = newId();
        await repository.issueEmailChange(requestId, {
          tokenHash, outboxId, sealedEmail: sealEmailValue(tokenHash, email), sealedPayload: seal(outboxId, { recipient: email, token }),
        });
        return repository.get(accessToken, requestId);
      }

      if (subject.donorId === undefined || eraser === undefined) throw new ApiError('INTERNAL_ERROR');
      try {
        await eraser.deleteAccount(subject.donorId);
      } catch {
        await repository.failExecution(requestId);
        throw new ApiError('SERVICE_UNAVAILABLE');
      }
      await finishDeletion(requestId, subject.donorId);
      return repository.get(accessToken, requestId);
    },
  });
}

export type PrivacyRequestsService = ReturnType<typeof createPrivacyRequestsService>;
