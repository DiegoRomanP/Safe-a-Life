import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  demoAuditEvents,
  demoConfiguration,
  demoDonorData,
  demoHospitals,
  demoMemberships,
  demoRequests,
  demoSites,
  demoTasks,
} from './demoData.js';
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

const MINUTE = 60_000;
const STEP_UP_MINUTES = 5;
const GRANT_MINUTES = 10;

export type NewSite = Pick<Site, 'hospitalId' | 'publicName' | 'publicAddress' | 'coordinates'>;

// Campos de CreateAccessGrantRequest.allowedFields.
export type GrantField = 'name' | 'email' | 'declaredBloodType';

type Grant = { action: 'review' | 'execute'; allowedFields: GrantField[]; expiresAt: number };

type SuperadminDemo = {
  tasks: SuperadminTask[];
  hospitals: Hospital[];
  sites: Site[];
  memberships: Membership[];
  requests: AdminCorrectionRequest[];
  configuration: SuperadminConfiguration;
  auditEvents: AuditEvent[];
  // Step-up (verifyStepUp): vigente 5 minutos.
  stepUpValid: () => boolean;
  verifyStepUp: () => void;
  createHospital: (input: { publicName: string; legalName: string }) => Hospital;
  setHospitalAuthorized: (hospitalId: string, isAuthorized: boolean) => void;
  createSite: (input: NewSite) => Site;
  approveSite: (siteId: string) => void;
  inviteAdmin: (input: { email: string; hospitalId: string }) => void;
  revokeMembership: (membershipId: string, reason: string) => void;
  // Grant contextual de revisión (createContextualAccessGrant, action review):
  // vigente 10 minutos, con campos y motivo.
  grantReview: (requestId: string, allowedFields: GrantField[], reason: string) => void;
  donorDataFor: (requestId: string) => ContextualDonorData | null;
  decideRequest: (requestId: string, decision: 'aprobada' | 'rechazada', reason: string) => void;
  // Grant de ejecución (action execute) y ejecución de una solicitud aprobada
  // (executeApprovedCorrectionRequest), en ese orden.
  executeRequest: (requestId: string, allowedFields: GrantField[], reason: string) => void;
  setFinalDemoAt: (iso: string) => void;
};

const SuperadminDemoContext = createContext<SuperadminDemo | null>(null);

function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

// Estado en memoria del área del superadmin para recorrerla sin backend (D-4).
// Imita las operaciones del contrato y su regla de step-up de 5 minutos y de
// grant contextual de 10 minutos. Cada acción agrega su evento minimizado a la
// auditoría (actor y recurso opacos, sin valores). Recargar la página vuelve a
// los datos iniciales; nada se guarda en el navegador.
export function SuperadminDemoProvider({ children, now = () => Date.now() }: { children: ReactNode; now?: () => number }) {
  const [tasks, setTasks] = useState(demoTasks);
  const [hospitals, setHospitals] = useState(demoHospitals);
  const [sites, setSites] = useState(demoSites);
  const [memberships, setMemberships] = useState(demoMemberships);
  const [requests, setRequests] = useState(demoRequests);
  const [configuration, setConfiguration] = useState(demoConfiguration);
  const [auditEvents, setAuditEvents] = useState(demoAuditEvents);
  const [stepUpUntil, setStepUpUntil] = useState(0);
  const [grants, setGrants] = useState<Record<string, Grant>>({});

  const value = useMemo<SuperadminDemo>(() => {
    const iso = () => new Date(now()).toISOString();
    const audit = (event: string, resourceCode: string, reason?: string) =>
      setAuditEvents((current) => [
        {
          eventId: crypto.randomUUID(),
          actorCode: 'ACT-SA01',
          event,
          resourceCode,
          result: 'ok',
          occurredAt: iso(),
          ...(reason ? { reason } : {}),
        },
        ...current,
      ]);
    // Un grant vale para una acción y vence a los 10 minutos; cambiar el estado
    // de la solicitud lo revoca.
    const dropGrant = (requestId: string) =>
      setGrants((current) => {
        const { [requestId]: _dropped, ...rest } = current;
        return rest;
      });
    const code = (prefix: string, id: string) => `${prefix}-${id.slice(0, 4).toUpperCase()}`;
    const touch = (requestId: string, patch: Partial<AdminCorrectionRequest>) =>
      setRequests((current) =>
        current.map((item) => (item.requestId === requestId ? { ...item, ...patch, updatedAt: iso() } : item)),
      );
    const closeTask = (resourceCode: string) =>
      setTasks((current) => current.filter((task) => task.resourceCode !== resourceCode));

    return {
      tasks,
      hospitals,
      sites,
      memberships,
      requests,
      configuration,
      auditEvents,
      stepUpValid: () => now() < stepUpUntil,
      verifyStepUp: () => setStepUpUntil(now() + STEP_UP_MINUTES * MINUTE),
      createHospital: (input) => {
        const created: Hospital = { hospitalId: crypto.randomUUID(), ...input, isAuthorized: false, createdAt: iso() };
        setHospitals((current) => [...current, created]);
        audit('hospital.creado', code('HOS', created.hospitalId));
        return created;
      },
      setHospitalAuthorized: (hospitalId, isAuthorized) => {
        setHospitals((current) =>
          current.map((item) => (item.hospitalId === hospitalId ? { ...item, isAuthorized } : item)),
        );
        audit(isAuthorized ? 'hospital.autorizado' : 'hospital.desautorizado', code('HOS', hospitalId));
      },
      createSite: (input) => {
        const created: Site = { siteId: crypto.randomUUID(), ...input, publicInstructions: null, isActive: false, isApproved: false };
        setSites((current) => [...current, created]);
        audit('sede.creada', code('SED', created.siteId));
        return created;
      },
      approveSite: (siteId) => {
        setSites((current) =>
          current.map((item) => (item.siteId === siteId ? { ...item, isApproved: true, isActive: true } : item)),
        );
        closeTask(code('SED', siteId));
        audit('sede.aprobada', code('SED', siteId));
      },
      inviteAdmin: ({ email, hospitalId }) => {
        const membershipId = crypto.randomUUID();
        setMemberships((current) => [
          ...current,
          { membershipId, hospitalId, role: 'admin_hospitalario', status: 'pendiente', emailHint: maskEmail(email) },
        ]);
        audit('admin.invitado', code('MEM', membershipId));
      },
      revokeMembership: (membershipId, reason) => {
        setMemberships((current) =>
          current.map((item) => (item.membershipId === membershipId ? { ...item, status: 'revocada' } : item)),
        );
        audit('membresia.revocada', code('MEM', membershipId), reason);
      },
      grantReview: (requestId, allowedFields, reason) => {
        setGrants((current) => ({
          ...current,
          [requestId]: { action: 'review', allowedFields, expiresAt: now() + GRANT_MINUTES * MINUTE },
        }));
        audit('acceso.contextual.revision', code('SOL', requestId), reason);
      },
      donorDataFor: (requestId) => {
        const grant = grants[requestId];
        return grant?.action === 'review' && grant.expiresAt > now() ? (demoDonorData[requestId] ?? null) : null;
      },
      decideRequest: (requestId, decision, reason) => {
        touch(requestId, { status: decision, decisionReason: reason });
        dropGrant(requestId);
        closeTask(code('SOL', requestId));
        audit(decision === 'aprobada' ? 'solicitud.aprobada' : 'solicitud.rechazada', code('SOL', requestId), reason);
      },
      // En la demo el grant de ejecución se registra en la auditoría y se usa en
      // el acto; los campos solo acompañan la forma del contrato.
      executeRequest: (requestId, _allowedFields, reason) => {
        if (requests.find((item) => item.requestId === requestId)?.status !== 'aprobada') return;
        audit('acceso.contextual.ejecucion', code('SOL', requestId), reason);
        touch(requestId, { status: 'completada' });
        dropGrant(requestId);
        audit('solicitud.ejecutada', code('SOL', requestId));
      },
      setFinalDemoAt: (finalDemoAt) => {
        setConfiguration({ finalDemoAt, isImmutable: true });
        audit('configuracion.fecha_final', 'CFG-DEMO');
      },
    };
  }, [tasks, hospitals, sites, memberships, requests, configuration, auditEvents, stepUpUntil, grants, now]);

  return <SuperadminDemoContext.Provider value={value}>{children}</SuperadminDemoContext.Provider>;
}

export function useSuperadminDemo(): SuperadminDemo {
  const value = useContext(SuperadminDemoContext);
  if (!value) throw new Error('useSuperadminDemo debe usarse dentro de SuperadminDemoProvider.');
  return value;
}
