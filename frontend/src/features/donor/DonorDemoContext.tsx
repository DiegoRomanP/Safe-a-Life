import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { errorKindOf, type DemoScenario } from '../../lib/demoApi.js';
import { rememberNull } from '../../lib/rememberNull.js';
import {
  changeInvitationResponse, completeOwnOnboarding, createOwnRequest, fetchOwnHistory, fetchOwnInvitation, fetchOwnInvitations, fetchOwnProfile,
  fetchOwnRequests, updateOwnParticipation, type NewCorrectionRequest, type ParticipationPatch,
} from './api.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

export type { NewCorrectionRequest };

export type HistoryEntry = ResponseHistoryItem & { hospitalName: string };

// Operaciones del contrato que usa el área del donante. Todas son reales (el backend es la fuente: invitaciones, respuestas,
// historial, perfil y solicitudes). Cada lectura cambia de identidad cuando cambian sus datos, para que la vista se revalide
// tras una escritura. El nombre `DonorDemo` se conserva por los selectores de escenario de desarrollo (`scenario`).
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

export function DonorDemoProvider({ children }: { children: ReactNode; now?: () => string }) {
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  // Cada escritura real da a sus lecturas una identidad nueva para que la vista se revalide.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  // El 404 esperado del donante sin perfil (getOwnDonorProfile antes del onboarding) se pide una vez y no en cada vista;
  // completar el onboarding crea una identidad nueva con reloadProfile.
  const [getProfile, setGetProfile] = useState(() => rememberNull(fetchOwnProfile));
  const reloadProfile = useCallback(() => setGetProfile(() => rememberNull(fetchOwnProfile)), []);
  const [listRequests, setListRequests] = useState(() => () => fetchOwnRequests());

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` solo cambia la identidad para revalidar.
  const listInvitations = useCallback(() => fetchOwnInvitations(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getInvitation = useCallback((invitationId: string) => fetchOwnInvitation(invitationId), [version]);
  const listHistory = useCallback(async (): Promise<HistoryEntry[]> => {
    const [history, invitations] = await Promise.all([fetchOwnHistory(), fetchOwnInvitations()]);
    return history.map((item) => ({ ...item, hospitalName: invitations.find((i) => i.invitationId === item.invitationId)?.hospitalName ?? 'Invitación' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const respond = useCallback(async (invitationId: string, response: 'confirmada' | 'rechazada') => {
    await changeInvitationResponse(invitationId, response);
    refresh();
  }, [refresh]);
  // La disponibilidad solo cambia en pantalla después de que el backend la guarda; las invitaciones que invalida las trae él.
  const updateParticipation = useCallback(async (patch: ParticipationPatch) => {
    await updateOwnParticipation(patch);
    reloadProfile();
    refresh();
  }, [reloadProfile, refresh]);
  const completeOnboarding = useCallback(async (data: Omit<DonorProfile, 'email'>) => {
    try {
      await completeOwnOnboarding(data);
    } catch (error) {
      // 409: el perfil ya estaba activo (p. ej. completado en otra pestaña); se vuelve a pedir para salir de la pantalla de enfoque.
      if (errorKindOf(error) === 'conflicto') reloadProfile();
      throw error;
    }
    reloadProfile();
  }, [reloadProfile]);
  const createRequest = useCallback(async (request: NewCorrectionRequest) => {
    const created = await createOwnRequest(request);
    setListRequests(() => () => fetchOwnRequests());
    return created;
  }, []);

  const value = useMemo<DonorDemo>(
    () => ({
      scenario, setScenario, listInvitations, getInvitation, listHistory, getProfile, listRequests, respond, updateParticipation, completeOnboarding, createRequest,
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
