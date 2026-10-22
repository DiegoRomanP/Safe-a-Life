import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { demoBatches, demoNeeds, demoResponses, demoSignups, demoSites } from './demoData.js';
import type {
  AssistedSignup,
  HospitalNeed,
  HospitalSite,
  InvitationBatch,
  NeedResponse,
  NeedStatus,
  NewNeed,
} from './types.js';

const HOUR = 3_600_000;

type HospitalDemo = {
  needs: HospitalNeed[];
  sites: HospitalSite[];
  signups: AssistedSignup[];
  responsesOf: (needId: string) => NeedResponse[];
  batchesOf: (needId: string) => InvitationBatch[];
  createNeed: (need: NewNeed, activate: boolean) => HospitalNeed;
  transitionNeed: (needId: string, status: Extract<NeedStatus, 'activa' | 'cerrada' | 'cancelada'>) => void;
  requestBatch: (needId: string) => { createdInvitationCount: number; queuedEmailCount: number };
  createSignup: (input: { email: string; name?: string }) => void;
  reissueSignup: (signupId: string) => void;
};

const HospitalDemoContext = createContext<HospitalDemo | null>(null);

// Cuántas invitaciones crea un lote de demostración. En la API real lo decide
// el servidor con los filtros de preselección; el hospital no elige donantes.
const DEMO_BATCH_SIZE = 2;

// Estado en memoria del área del hospital para recorrerla sin backend (D-4).
// Imita createHospitalNeed (crea un borrador; «activar» aplica además
// transitionOwnHospitalNeed), transitionOwnHospitalNeed, requestInvitationBatch
// (suma invitaciones «Sin respuesta» pendientes de entrega),
// createAssistedSignup y reissueAssistedActivationLink. Recargar la página
// vuelve a los datos iniciales; nada se guarda en el navegador.
export function HospitalDemoProvider({ children, now = () => Date.now() }: { children: ReactNode; now?: () => number }) {
  const [needs, setNeeds] = useState(demoNeeds);
  const [responses, setResponses] = useState(demoResponses);
  const [batches, setBatches] = useState(demoBatches);
  const [signups, setSignups] = useState(demoSignups);

  const value = useMemo<HospitalDemo>(
    () => ({
      needs,
      sites: demoSites,
      signups,
      responsesOf: (needId) => responses[needId] ?? [],
      batchesOf: (needId) => batches[needId] ?? [],
      createNeed: (input, activate) => {
        const created: HospitalNeed = {
          needId: crypto.randomUUID(),
          component: 'RBC',
          requiredBloodType: input.requiredBloodType,
          targetConfirmations: input.targetConfirmations,
          confirmedIntentCount: 0,
          siteId: input.siteId,
          radiusKm: input.radiusKm,
          urgency: input.urgency,
          status: activate ? 'activa' : 'borrador',
          expiresAt: new Date(now() + input.expiresInHours * HOUR).toISOString(),
        };
        setNeeds((current) => [created, ...current]);
        return created;
      },
      transitionNeed: (needId, status) =>
        setNeeds((current) => current.map((need) => (need.needId === needId ? { ...need, status } : need))),
      requestBatch: (needId) => {
        const createdAt = new Date(now()).toISOString();
        const fresh: NeedResponse[] = Array.from({ length: DEMO_BATCH_SIZE }, () => ({
          needDonorCode: `D-${crypto.randomUUID().slice(0, 4).toUpperCase()}-NV`,
          validity: 'activa',
          delivery: 'pendiente',
          response: 'sin_respuesta',
        }));
        setResponses((current) => ({ ...current, [needId]: [...(current[needId] ?? []), ...fresh] }));
        setBatches((current) => ({
          ...current,
          [needId]: [
            ...(current[needId] ?? []),
            {
              batchId: crypto.randomUUID(),
              createdAt,
              createdInvitationCount: DEMO_BATCH_SIZE,
              deliveryCounts: { pendiente: DEMO_BATCH_SIZE, enviada: 0, entregada: 0, fallida: 0 },
            },
          ],
        }));
        return { createdInvitationCount: DEMO_BATCH_SIZE, queuedEmailCount: DEMO_BATCH_SIZE };
      },
      // Solo guarda estado y fechas: el contrato no devuelve correo ni nombre.
      createSignup: () => {
        const createdAt = now();
        setSignups((current) => [
          {
            signupId: crypto.randomUUID(),
            status: 'pendiente',
            createdAt: new Date(createdAt).toISOString(),
            activationExpiresAt: new Date(createdAt + 24 * HOUR).toISOString(),
            purgeAt: new Date(createdAt + 30 * 24 * HOUR).toISOString(),
          },
          ...current,
        ]);
      },
      // Reemitir vuelve a «pendiente» con un enlace de 24 h y no reinicia
      // createdAt ni purgeAt (AP-01).
      reissueSignup: (signupId) =>
        setSignups((current) =>
          current.map((signup) =>
            signup.signupId === signupId
              ? { ...signup, status: 'pendiente', activationExpiresAt: new Date(now() + 24 * HOUR).toISOString() }
              : signup,
          ),
        ),
    }),
    [needs, responses, batches, signups, now],
  );

  return <HospitalDemoContext.Provider value={value}>{children}</HospitalDemoContext.Provider>;
}

export function useHospitalDemo(): HospitalDemo {
  const value = useContext(HospitalDemoContext);
  if (!value) throw new Error('useHospitalDemo debe usarse dentro de HospitalDemoProvider.');
  return value;
}
