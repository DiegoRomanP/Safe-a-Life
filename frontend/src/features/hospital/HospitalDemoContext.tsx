import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { demoNeeds, demoResponses, demoSites } from './demoData.js';
import type { HospitalNeed, HospitalSite, NeedResponse, NeedStatus, NewNeed } from './types.js';

type HospitalDemo = {
  needs: HospitalNeed[];
  sites: HospitalSite[];
  responsesOf: (needId: string) => NeedResponse[];
  createNeed: (need: NewNeed, activate: boolean) => HospitalNeed;
  transitionNeed: (needId: string, status: Extract<NeedStatus, 'activa' | 'cerrada' | 'cancelada'>) => void;
};

const HospitalDemoContext = createContext<HospitalDemo | null>(null);

// Estado en memoria del área del hospital para recorrerla sin backend (D-4).
// Imita createHospitalNeed (crea un borrador, y «activar» aplica además
// transitionOwnHospitalNeed) y transitionOwnHospitalNeed. Recargar la página
// vuelve a los datos iniciales; nada se guarda en el navegador.
export function HospitalDemoProvider({ children, now = () => Date.now() }: { children: ReactNode; now?: () => number }) {
  const [needs, setNeeds] = useState(demoNeeds);

  const value = useMemo<HospitalDemo>(
    () => ({
      needs,
      sites: demoSites,
      responsesOf: (needId) => demoResponses[needId] ?? [],
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
          expiresAt: new Date(now() + input.expiresInHours * 3_600_000).toISOString(),
        };
        setNeeds((current) => [created, ...current]);
        return created;
      },
      transitionNeed: (needId, status) =>
        setNeeds((current) => current.map((need) => (need.needId === needId ? { ...need, status } : need))),
    }),
    [needs, now],
  );

  return <HospitalDemoContext.Provider value={value}>{children}</HospitalDemoContext.Provider>;
}

export function useHospitalDemo(): HospitalDemo {
  const value = useContext(HospitalDemoContext);
  if (!value) throw new Error('useHospitalDemo debe usarse dentro de HospitalDemoProvider.');
  return value;
}
