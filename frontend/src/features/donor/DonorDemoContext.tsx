import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BloodType } from '../../lib/format.js';
import { demoHistory, demoInvitations, demoProfile, demoRequests } from './demoData.js';
import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

// Cuerpo de createOwnCorrectionRequest (oneOf del contrato).
export type NewCorrectionRequest =
  | { type: 'correccion'; changes: { name?: string; newEmail?: string; declaredBloodType?: BloodType } }
  | { type: 'eliminacion' };

type DonorDemo = {
  invitations: DonorInvitation[];
  history: ResponseHistoryItem[];
  profile: DonorProfile;
  requests: CorrectionRequest[];
  respond: (invitationId: string, response: 'confirmada' | 'rechazada') => void;
  updateParticipation: (patch: Pick<DonorProfile, 'isAvailable' | 'approximateLocation'>) => void;
  completeOnboarding: (data: Omit<DonorProfile, 'email'>) => void;
  createRequest: (request: NewCorrectionRequest) => CorrectionRequest;
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
// pendiente; los valores nuevos no se guardan en el navegador). Recargar la
// página vuelve a los datos iniciales; nada se guarda en el navegador.
export function DonorDemoProvider({ children, now = () => new Date().toISOString() }: { children: ReactNode; now?: () => string }) {
  const [invitations, setInvitations] = useState(demoInvitations);
  const [history, setHistory] = useState(demoHistory);
  const [profile, setProfile] = useState(demoProfile);
  const [requests, setRequests] = useState(demoRequests);

  const value = useMemo<DonorDemo>(
    () => ({
      invitations,
      history,
      profile,
      requests,
      respond: (invitationId, response) => {
        setInvitations((current) =>
          current.map((item) => (item.invitationId === invitationId ? { ...item, response } : item)),
        );
        setHistory((current) => [{ invitationId, response, changedAt: now() }, ...current]);
      },
      updateParticipation: (patch) => {
        setProfile((current) => ({ ...current, ...patch }));
        if (!patch.isAvailable) {
          setInvitations((current) =>
            current.map((item) =>
              item.validity === 'activa' && item.response === 'sin_respuesta' ? { ...item, validity: 'invalidada' } : item,
            ),
          );
        }
      },
      // completeDonorOnboarding: fija los campos obligatorios; el correo no cambia.
      completeOnboarding: (data) => setProfile((current) => ({ ...current, ...data })),
      createRequest: (request) => {
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
      },
    }),
    [invitations, history, profile, requests, now],
  );

  return <DonorDemoContext.Provider value={value}>{children}</DonorDemoContext.Provider>;
}

export function useDonorDemo(): DonorDemo {
  const value = useContext(DonorDemoContext);
  if (!value) throw new Error('useDonorDemo debe usarse dentro de DonorDemoProvider.');
  return value;
}
