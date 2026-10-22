import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { demoHistory, demoInvitations, demoProfile, demoRequests } from './demoData.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

type DonorDemo = {
  invitations: DonorInvitation[];
  history: ResponseHistoryItem[];
  profile: DonorProfile;
  requests: CorrectionRequest[];
  respond: (invitationId: string, response: 'confirmada' | 'rechazada') => void;
  updateParticipation: (patch: Pick<DonorProfile, 'isAvailable' | 'approximateLocation'>) => void;
  completeOnboarding: (data: Omit<DonorProfile, 'email'>) => void;
};

const DonorDemoContext = createContext<DonorDemo | null>(null);

// Estado en memoria del área del donante para recorrerla sin backend (D-4).
// Imita lo que harían changeOwnInvitationResponse (actualiza la respuesta y
// agrega una entrada al historial) y updateOwnDonorParticipation. Recargar la
// página vuelve a los datos iniciales; nada se guarda en el navegador.
export function DonorDemoProvider({ children, now = () => new Date().toISOString() }: { children: ReactNode; now?: () => string }) {
  const [invitations, setInvitations] = useState(demoInvitations);
  const [history, setHistory] = useState(demoHistory);
  const [profile, setProfile] = useState(demoProfile);

  const value = useMemo<DonorDemo>(
    () => ({
      invitations,
      history,
      profile,
      requests: demoRequests,
      respond: (invitationId, response) => {
        setInvitations((current) =>
          current.map((item) => (item.invitationId === invitationId ? { ...item, response } : item)),
        );
        setHistory((current) => [{ invitationId, response, changedAt: now() }, ...current]);
      },
      updateParticipation: (patch) => setProfile((current) => ({ ...current, ...patch })),
      // completeDonorOnboarding: fija los campos obligatorios; el correo no cambia.
      completeOnboarding: (data) => setProfile((current) => ({ ...current, ...data })),
    }),
    [invitations, history, profile, now],
  );

  return <DonorDemoContext.Provider value={value}>{children}</DonorDemoContext.Provider>;
}

export function useDonorDemo(): DonorDemo {
  const value = useContext(DonorDemoContext);
  if (!value) throw new Error('useDonorDemo debe usarse dentro de DonorDemoProvider.');
  return value;
}
