import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError, demoRead, demoWrite, type DemoScenario } from '../../lib/demoApi.js';
import type { BloodType } from '../../lib/format.js';
import { completeOwnOnboarding, fetchOwnProfile, updateOwnParticipation, type ParticipationPatch } from './api.js';
import { demoHistory, demoInvitations, demoRequests } from './demoData.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

// Cuerpo de createOwnCorrectionRequest (oneOf del contrato).
export type NewCorrectionRequest =
  | { type: 'correccion'; changes: { name?: string; newEmail?: string; declaredBloodType?: BloodType } }
  | { type: 'eliminacion' };

export type HistoryEntry = ResponseHistoryItem & { hospitalName: string };

// Operaciones del contrato que usa el área del donante. Todas son asíncronas,
// como lo serán con el cliente HTTP. Cada lectura cambia de identidad cuando
// cambian sus datos, para que la vista se revalide tras una escritura.
type DonorDemo = {
  scenario: DemoScenario;
  setScenario: (scenario: DemoScenario) => void;
  listInvitations: () => Promise<DonorInvitation[]>;
  /** Si no existe o no es de la persona falla con `sin_permiso`: 404 y 403 se ven igual. */
  getInvitation: (invitationId: string) => Promise<DonorInvitation>;
  listHistory: () => Promise<HistoryEntry[]>;
  /** Perfil real del backend; `null` si aún no completó el onboarding. */
  getProfile: () => Promise<DonorProfile | null>;
  listRequests: () => Promise<CorrectionRequest[]>;
  respond: (invitationId: string, response: 'confirmada' | 'rechazada') => Promise<void>;
  updateParticipation: (patch: ParticipationPatch) => Promise<void>;
  completeOnboarding: (data: Omit<DonorProfile, 'email'>) => Promise<void>;
  createRequest: (request: NewCorrectionRequest) => Promise<CorrectionRequest>;
};

const DonorDemoContext = createContext<DonorDemo | null>(null);

function requestedFieldsOf(request: NewCorrectionRequest): CorrectionRequest['requestedFields'] {
  if (request.type === 'eliminacion') return ['deletion'];
  const fields: CorrectionRequest['requestedFields'] = [];
  if (request.changes.name) fields.push('name');
  if (request.changes.newEmail) fields.push('email');
  if (request.changes.declaredBloodType) fields.push('declaredBloodType');
  return fields;
}

// Área del donante. El perfil es REAL: getOwnDonorProfile, completeDonorOnboarding
// y updateOwnDonorParticipation van al backend y se guardan en la base. El resto
// sigue siendo demo en memoria porque su backend no existe (F6 invitaciones e
// historial) o no se conecta en esta demo (solicitudes F7): changeOwnInvitationResponse,
// el efecto de marcarse no disponible sobre las invitaciones de ejemplo y
// createOwnCorrectionRequest. Esas respuestas pasan por demoRead/demoWrite y el
// escenario elegido en desarrollo; recargar la página vuelve a sus datos iniciales.
export function DonorDemoProvider({ children, now = () => new Date().toISOString() }: { children: ReactNode; now?: () => string }) {
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [invitations, setInvitations] = useState(demoInvitations);
  const [history, setHistory] = useState(demoHistory);
  // Cada escritura real del perfil da a getProfile una identidad nueva para que la vista se revalide.
  const [getProfile, setGetProfile] = useState(() => () => fetchOwnProfile());
  const reloadProfile = useCallback(() => setGetProfile(() => () => fetchOwnProfile()), []);
  const [requests, setRequests] = useState(demoRequests);

  const listInvitations = useCallback(() => demoRead(scenario, () => invitations), [scenario, invitations]);
  const getInvitation = useCallback(
    (invitationId: string) =>
      demoRead(scenario, () => {
        const found = invitations.find((item) => item.invitationId === invitationId);
        if (!found) throw new ApiError('sin_permiso');
        return found;
      }),
    [scenario, invitations],
  );
  const listHistory = useCallback(
    () =>
      demoRead(scenario, () =>
        history.map((item) => ({
          ...item,
          hospitalName: invitations.find((invitation) => invitation.invitationId === item.invitationId)?.hospitalName ?? 'Invitación',
        })),
      ),
    [scenario, history, invitations],
  );
  const listRequests = useCallback(() => demoRead(scenario, () => requests), [scenario, requests]);

  const respond = useCallback(
    (invitationId: string, response: 'confirmada' | 'rechazada') =>
      demoWrite(scenario, () => {
        setInvitations((current) =>
          current.map((item) => (item.invitationId === invitationId ? { ...item, response } : item)),
        );
        setHistory((current) => [{ invitationId, response, changedAt: now() }, ...current]);
      }),
    [scenario, now],
  );
  // La disponibilidad solo cambia en pantalla después de que el backend la guarda.
  const updateParticipation = useCallback(async (patch: ParticipationPatch) => {
    await updateOwnParticipation(patch);
    reloadProfile();
    if (!patch.isAvailable) {
      setInvitations((current) =>
        current.map((item) =>
          item.validity === 'activa' && item.response === 'sin_respuesta' ? { ...item, validity: 'invalidada' } : item,
        ),
      );
    }
  }, [reloadProfile]);
  // completeDonorOnboarding: fija los campos obligatorios; el correo no cambia.
  const completeOnboarding = useCallback(async (data: Omit<DonorProfile, 'email'>) => {
    await completeOwnOnboarding(data);
    reloadProfile();
  }, [reloadProfile]);
  const createRequest = useCallback(
    (request: NewCorrectionRequest) =>
      demoWrite(scenario, () => {
        const createdAt = now();
        const created: CorrectionRequest = {
          requestId: crypto.randomUUID(),
          type: request.type,
          requestedFields: requestedFieldsOf(request),
          status: 'pendiente',
          createdAt,
          updatedAt: createdAt,
        };
        setRequests((current) => [created, ...current]);
        return created;
      }),
    [scenario, now],
  );

  const value = useMemo<DonorDemo>(
    () => ({
      scenario,
      setScenario,
      listInvitations,
      getInvitation,
      listHistory,
      getProfile,
      listRequests,
      respond,
      updateParticipation,
      completeOnboarding,
      createRequest,
    }),
    [scenario, listInvitations, getInvitation, listHistory, getProfile, listRequests, respond, updateParticipation, completeOnboarding, createRequest],
  );

  return <DonorDemoContext.Provider value={value}>{children}</DonorDemoContext.Provider>;
}

export function useDonorDemo(): DonorDemo {
  const value = useContext(DonorDemoContext);
  if (!value) throw new Error('useDonorDemo debe usarse dentro de DonorDemoProvider.');
  return value;
}
