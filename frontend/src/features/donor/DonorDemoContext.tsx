import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError, demoRead, demoWrite, type DemoScenario } from '../../lib/demoApi.js';
import type { BloodType } from '../../lib/format.js';
import { demoHistory, demoInvitations, demoProfile, demoRequests } from './demoData.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

// Cuerpo de createOwnCorrectionRequest (oneOf del contrato).
export type NewCorrectionRequest =
  | { type: 'correccion'; changes: { name?: string; newEmail?: string; declaredBloodType?: BloodType } }
  | { type: 'eliminacion' };

export type HistoryEntry = ResponseHistoryItem & { hospitalName: string };

type ParticipationPatch = Pick<DonorProfile, 'isAvailable' | 'approximateLocation'>;

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
  getProfile: () => Promise<DonorProfile>;
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

// Estado en memoria del área del donante para recorrerla sin backend (D-4).
// Imita lo que harían changeOwnInvitationResponse (actualiza la respuesta y
// agrega una entrada al historial), updateOwnDonorParticipation (marcarse no
// disponible invalida las invitaciones activas sin respuesta),
// completeDonorOnboarding y createOwnCorrectionRequest (la solicitud queda
// pendiente; los valores nuevos no se guardan en el navegador). Las respuestas
// pasan por demoRead/demoWrite, que simulan la latencia y los fallos del
// escenario elegido en desarrollo. Recargar la página vuelve a los datos
// iniciales; nada se guarda en el navegador.
export function DonorDemoProvider({ children, now = () => new Date().toISOString() }: { children: ReactNode; now?: () => string }) {
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [invitations, setInvitations] = useState(demoInvitations);
  const [history, setHistory] = useState(demoHistory);
  const [profile, setProfile] = useState(demoProfile);
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
  const getProfile = useCallback(() => demoRead(scenario, () => profile), [scenario, profile]);
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
  const updateParticipation = useCallback(
    (patch: ParticipationPatch) =>
      demoWrite(scenario, () => {
        setProfile((current) => ({ ...current, ...patch }));
        if (!patch.isAvailable) {
          setInvitations((current) =>
            current.map((item) =>
              item.validity === 'activa' && item.response === 'sin_respuesta' ? { ...item, validity: 'invalidada' } : item,
            ),
          );
        }
      }),
    [scenario],
  );
  // completeDonorOnboarding: fija los campos obligatorios; el correo no cambia.
  const completeOnboarding = useCallback(
    (data: Omit<DonorProfile, 'email'>) => demoWrite(scenario, () => setProfile((current) => ({ ...current, ...data }))),
    [scenario],
  );
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
