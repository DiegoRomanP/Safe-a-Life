import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/demoApi.js';
import { isStepUpValid, verifyStepUpCode } from '../auth/session/session.js';
import {
  approveSiteRequest,
  createAccessGrant,
  createHospitalRequest,
  createSiteRequest,
  decideRequestRequest,
  executeRequestRequest,
  fetchAuditEvents,
  fetchConfiguration,
  fetchDonorData,
  fetchHospitals,
  fetchMemberships,
  fetchRequests,
  fetchSites,
  fetchTasks,
  inviteAdminRequest,
  revokeMembershipRequest,
  setFinalDemoAtRequest,
  updateHospitalAuthorization,
  type GrantField,
  type NewSite,
} from './api.js';
import type {
  AdminCorrectionRequest,
  AuditEvent,
  ContextualDonorData,
  Hospital,
  Membership,
  Site,
  SuperadminConfiguration,
  SuperadminTask,
} from './types.js';

export type { GrantField, NewSite } from './api.js';

type Data = {
  tasks: SuperadminTask[];
  hospitals: Hospital[];
  sites: Site[];
  memberships: Membership[];
  requests: AdminCorrectionRequest[];
  configuration: SuperadminConfiguration;
  auditEvents: AuditEvent[];
};

export type StepUpOutcome = 'ok' | 'incorrecto' | 'error';

// Las acciones devuelven `null`/`false` si fallaron: el motivo queda en `actionError` (ver ActionError) y nada cambió.
type Superadmin = Data & {
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
  actionError: string | null;
  clearActionError: () => void;
  // Step-up (POST /auth/step-up-verifications): vigente hasta el `verifiedUntil` del servidor (máx. 5 minutos).
  stepUpValid: () => boolean;
  verifyStepUp: (code: string) => Promise<StepUpOutcome>;
  createHospital: (input: { publicName: string; legalName: string }) => Promise<Hospital | null>;
  setHospitalAuthorized: (hospitalId: string, isAuthorized: boolean) => Promise<boolean>;
  createSite: (input: NewSite) => Promise<Site | null>;
  approveSite: (siteId: string) => Promise<boolean>;
  inviteAdmin: (input: { email: string; hospitalId: string }) => Promise<boolean>;
  revokeMembership: (membershipId: string, reason: string) => Promise<boolean>;
  // Grant de revisión (action review, vigente hasta 10 minutos) y lectura de los datos con ese grant.
  grantReview: (requestId: string, allowedFields: GrantField[], reason: string) => Promise<boolean>;
  donorDataFor: (requestId: string) => ContextualDonorData | null;
  decideRequest: (requestId: string, decision: 'aprobada' | 'rechazada', reason: string) => Promise<boolean>;
  // Grant de ejecución (action execute) y ejecución de la solicitud aprobada, en ese orden.
  executeRequest: (requestId: string, allowedFields: GrantField[], reason: string) => Promise<boolean>;
  setFinalDemoAt: (iso: string) => Promise<boolean>;
};

const SuperadminContext = createContext<Superadmin | null>(null);

const EMPTY: Data = { tasks: [], hospitals: [], sites: [], memberships: [], requests: [], configuration: { finalDemoAt: null, isImmutable: false }, auditEvents: [] };

async function loadAll(): Promise<Data> {
  const [tasks, hospitals, memberships, requests, configuration, auditEvents] = await Promise.all([
    fetchTasks(), fetchHospitals(), fetchMemberships(), fetchRequests(), fetchConfiguration(), fetchAuditEvents(),
  ]);
  // No hay listado global de sedes: se piden por hospital.
  const sites = (await Promise.all(hospitals.map((hospital) => fetchSites(hospital.hospitalId)))).flat();
  return { tasks, hospitals, sites, memberships, requests, configuration, auditEvents };
}

function messageFor(error: unknown): string {
  const status = error instanceof ApiError ? error.status : undefined;
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'STEP_UP_REQUIRED') return 'Tu verificación reforzada venció. Vuelve a intentarlo y confirma el código.';
  if (code === 'MFA_REQUIRED') return 'Esta acción exige verificación en dos pasos. Vuelve a ingresar.';
  if (status === 409) return 'El estado cambió desde que abriste la pantalla. Actualizamos los datos; revisa e intenta de nuevo.';
  if (status === 410) return 'El acceso contextual venció. Solicita uno nuevo.';
  if (status === 400 || status === 422) return 'El servidor rechazó los datos. Revísalos e intenta de nuevo.';
  if (status === 403) return 'No tienes permiso para esta acción.';
  if (status === 429) return 'Demasiados intentos. Espera unos minutos.';
  return 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';
}

// Datos del área del superadmin desde el backend real. Las listas se cargan al entrar y se vuelven a pedir tras cada
// escritura: el servidor es la fuente (tareas, auditoría y códigos opacos los produce él). Los datos personales del donante
// solo viven en memoria, ligados a un grant de revisión, y se descartan al vencer.
export function SuperadminProvider({ children, now = () => Date.now() }: { children: ReactNode; now?: () => number }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tries, setTries] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [donorData, setDonorData] = useState<Record<string, { data: ContextualDonorData; expiresAt: number }>>({});
  const inFlight = useRef(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    loadAll().then(
      (next) => { if (live.current) { setData(next); setStatus('ready'); } },
      () => { if (live.current) setStatus('error'); },
    );
  }, [tries]);

  // Reintentar vuelve a mostrar «Cargando» (el estado inicial ya lo es).
  const reload = useCallback(() => {
    setStatus('loading');
    setTries((current) => current + 1);
  }, []);

  const value = useMemo<Superadmin>(() => {
    // Una escritura a la vez: dos clics seguidos no alcanzan a ver el estado pendiente.
    const act = async <T,>(run: () => Promise<T>): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setActionError(null);
      try {
        const result = await run();
        try {
          if (live.current) setData(await loadAll());
        } catch {
          if (live.current) setActionError('El cambio se guardó, pero no pudimos actualizar la lista. Recarga la página.');
        }
        return result;
      } catch (error) {
        if (live.current) setActionError(messageFor(error));
        // Un conflicto suele significar datos viejos: se refrescan sin ocultar el aviso.
        if (error instanceof ApiError && error.status === 409) loadAll().then((next) => { if (live.current) setData(next); }, () => undefined);
        return null;
      } finally {
        inFlight.current = false;
      }
    };
    const ok = async (run: () => Promise<unknown>) => (await act(run)) !== null;

    return {
      ...data,
      status,
      reload,
      actionError,
      clearActionError: () => setActionError(null),
      stepUpValid: () => isStepUpValid(now()),
      verifyStepUp: async (code) => {
        try {
          await verifyStepUpCode(code);
          return 'ok';
        } catch (error) {
          return error instanceof ApiError && error.status === 401 ? 'incorrecto' : 'error';
        }
      },
      createHospital: (input) => act(() => createHospitalRequest(input)),
      setHospitalAuthorized: (hospitalId, isAuthorized) => ok(() => updateHospitalAuthorization(hospitalId, isAuthorized)),
      createSite: (input) => act(() => createSiteRequest(input)),
      approveSite: (siteId) => ok(() => approveSiteRequest(siteId)),
      inviteAdmin: (input) => ok(async () => { await inviteAdminRequest(input); return true; }),
      revokeMembership: (membershipId, reason) => ok(() => revokeMembershipRequest(membershipId, reason)),
      grantReview: (requestId, allowedFields, reason) =>
        ok(async () => {
          const grant = await createAccessGrant(requestId, 'review', allowedFields, reason);
          const result = await fetchDonorData(requestId, grant);
          setDonorData((current) => ({ ...current, [requestId]: { data: result, expiresAt: Date.parse(grant.expiresAt) } }));
          return true;
        }),
      donorDataFor: (requestId) => {
        const entry = donorData[requestId];
        return entry && entry.expiresAt > now() ? entry.data : null;
      },
      decideRequest: (requestId, decision, reason) =>
        ok(async () => {
          const updated = await decideRequestRequest(requestId, decision, reason);
          setDonorData(({ [requestId]: _dropped, ...rest }) => rest);
          return updated;
        }),
      executeRequest: (requestId, allowedFields, reason) =>
        ok(async () => {
          const grant = await createAccessGrant(requestId, 'execute', allowedFields, reason);
          const updated = await executeRequestRequest(requestId, grant);
          setDonorData(({ [requestId]: _dropped, ...rest }) => rest);
          return updated;
        }),
      setFinalDemoAt: (iso) => ok(() => setFinalDemoAtRequest(iso)),
    };
  }, [data, status, reload, actionError, donorData, now]);

  return <SuperadminContext.Provider value={value}>{children}</SuperadminContext.Provider>;
}

export function useSuperadmin(): Superadmin {
  const value = useContext(SuperadminContext);
  if (!value) throw new Error('useSuperadmin debe usarse dentro de SuperadminProvider.');
  return value;
}
