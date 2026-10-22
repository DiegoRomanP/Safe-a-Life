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

// Datos sintéticos de demostración, tomados de Penpot (SA-01 a SA-07). Solo
// existen en memoria mientras no hay cliente HTTP (D-4). Los correos usan
// .example.test y solo aparecen como pista enmascarada o tras step-up.
export const demoHospitals: Hospital[] = [
  {
    hospitalId: 'a1c1d2e3-0001-4f5a-8b6c-7d8e9f0a1b11',
    publicName: 'Hospital Nacional Central',
    legalName: 'Hospital Nacional Central S.A. (demo)',
    isAuthorized: true,
    createdAt: '2026-09-01T13:30:00Z',
  },
  {
    hospitalId: 'a2c1d2e3-0002-4f5a-8b6c-7d8e9f0a1b22',
    publicName: 'Hospital Metropolitano Sur',
    legalName: 'Hospital Metropolitano Sur (demo)',
    isAuthorized: true,
    createdAt: '2026-09-03T21:12:00Z',
  },
  {
    hospitalId: 'a3c1d2e3-0003-4f5a-8b6c-7d8e9f0a1b33',
    publicName: 'Instituto Regional Lima',
    legalName: 'Instituto Regional Lima (demo)',
    isAuthorized: true,
    createdAt: '2026-09-05T16:45:00Z',
  },
  {
    hospitalId: 'a4c1d2e3-0004-4f5a-8b6c-7d8e9f0a1b44',
    publicName: 'Clínica Norte Demo',
    legalName: 'Clínica Norte Demo S.A.C.',
    isAuthorized: false,
    createdAt: '2026-09-20T15:00:00Z',
  },
];

const [hnc, hms, irl] = demoHospitals as [Hospital, Hospital, Hospital, Hospital];

export const demoSites: Site[] = [
  {
    siteId: 'b1d2e3f4-0001-4a5b-8c6d-7e8f9a0b1c11',
    hospitalId: hnc.hospitalId,
    publicName: 'Sede San Borja',
    publicAddress: 'Av. Ejemplo 120',
    coordinates: { latitude: -12.09, longitude: -77.0 },
    isActive: true,
    isApproved: true,
  },
  {
    siteId: 'b2d2e3f4-0002-4a5b-8c6d-7e8f9a0b1c22',
    hospitalId: hnc.hospitalId,
    publicName: 'Sede Cercado',
    publicAddress: 'Jr. Muestra 450',
    coordinates: { latitude: -12.05, longitude: -77.04 },
    isActive: true,
    isApproved: true,
  },
  {
    siteId: 'b3d2e3f4-0003-4a5b-8c6d-7e8f9a0b1c33',
    hospitalId: hms.hospitalId,
    publicName: 'Sede Barranco',
    publicAddress: 'Av. Demo 300',
    coordinates: { latitude: -12.15, longitude: -77.02 },
    isActive: true,
    isApproved: true,
  },
  {
    siteId: 'b4d2e3f4-0004-4a5b-8c6d-7e8f9a0b1c44',
    hospitalId: hms.hospitalId,
    publicName: 'Sede Villa El Salvador',
    publicAddress: 'Dirección minimizada',
    coordinates: { latitude: -12.21, longitude: -76.94 },
    isActive: false,
    isApproved: false,
  },
  {
    siteId: 'b5d2e3f4-0005-4a5b-8c6d-7e8f9a0b1c55',
    hospitalId: irl.hospitalId,
    publicName: 'Sede Cercado de Lima',
    publicAddress: 'Av. Prueba 77',
    coordinates: { latitude: -12.06, longitude: -77.03 },
    isActive: true,
    isApproved: true,
  },
];

export const demoMemberships: Membership[] = [
  { membershipId: 'c1e3f4a5-0001-4b6c-9d7e-8f9a0b1c2d11', hospitalId: hnc.hospitalId, role: 'admin_hospitalario', status: 'activa', emailHint: 'a***@example.test' },
  { membershipId: 'c2e3f4a5-0002-4b6c-9d7e-8f9a0b1c2d22', hospitalId: hms.hospitalId, role: 'admin_hospitalario', status: 'activa', emailHint: 'j***@example.test' },
  { membershipId: 'c3e3f4a5-0003-4b6c-9d7e-8f9a0b1c2d33', hospitalId: irl.hospitalId, role: 'admin_hospitalario', status: 'pendiente', emailHint: 'c***@example.test' },
];

export const demoRequests: AdminCorrectionRequest[] = [
  {
    requestId: '91a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01',
    type: 'eliminacion',
    requestedFields: ['deletion'],
    status: 'pendiente',
    createdAt: '2026-09-24T16:06:00Z',
    updatedAt: '2026-09-24T16:06:00Z',
  },
  {
    requestId: '7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84',
    type: 'correccion',
    requestedFields: ['declaredBloodType'],
    status: 'pendiente',
    createdAt: '2026-09-22T15:14:00Z',
    updatedAt: '2026-09-22T15:14:00Z',
  },
  {
    requestId: '2a09b9c4-5f6a-4b82-8d34-4e5f6a7b8c95',
    type: 'correccion',
    requestedFields: ['email'],
    status: 'completada',
    createdAt: '2026-09-08T14:00:00Z',
    updatedAt: '2026-09-09T21:42:00Z',
    decisionReason: 'Cambio de correo verificado por la persona.',
  },
];

// Solo los campos de cada solicitud (getContextualDonorData). La eliminación no
// necesita ver datos personales.
export const demoDonorData: Record<string, ContextualDonorData> = {
  '7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84': {
    currentValues: { declaredBloodType: 'A_POS' },
    proposedValues: { declaredBloodType: 'A_NEG' },
  },
};

// Una tarea por cada pendiente real de los datos anteriores. No hay fallos de
// entrega: reintentarlos (retryInvitationDelivery) no tiene vista todavía.
export const demoTasks: SuperadminTask[] = [
  { taskId: 'd3f4a5b6-0001-4c7d-8e9f-0a1b2c3d4e11', kind: 'correction_request', createdAt: '2026-09-24T16:06:00Z', resourceCode: 'SOL-91A2' },
  { taskId: 'd3f4a5b6-0002-4c7d-8e9f-0a1b2c3d4e22', kind: 'hospital_review', createdAt: '2026-09-24T14:42:00Z', resourceCode: 'SED-B4D2' },
  { taskId: 'd3f4a5b6-0003-4c7d-8e9f-0a1b2c3d4e33', kind: 'correction_request', createdAt: '2026-09-22T15:14:00Z', resourceCode: 'SOL-7F21' },
];

export const demoConfiguration: SuperadminConfiguration = { finalDemoAt: null, isImmutable: false };

export const demoAuditEvents: AuditEvent[] = [
  { eventId: 'e4a5b6c7-0001-4d8e-9f0a-1b2c3d4e5f11', actorCode: 'ACT-81F2', event: 'solicitud.consultada', resourceCode: 'SOL-7F21', result: 'ok', occurredAt: '2026-09-24T16:12:00Z' },
  { eventId: 'e4a5b6c7-0002-4d8e-9f0a-1b2c3d4e5f22', actorCode: 'ACT-12A0', event: 'solicitud.creada', resourceCode: 'SOL-91A2', result: 'ok', occurredAt: '2026-09-24T16:06:00Z' },
  { eventId: 'e4a5b6c7-0003-4d8e-9f0a-1b2c3d4e5f33', actorCode: 'ACT-470B', event: 'necesidad.activada', resourceCode: 'NEC-A104', result: 'ok', occurredAt: '2026-09-24T15:44:00Z' },
  { eventId: 'e4a5b6c7-0004-4d8e-9f0a-1b2c3d4e5f44', actorCode: 'ACT-470B', event: 'lote.creado', resourceCode: 'LOT-001', result: 'ok', occurredAt: '2026-09-24T14:32:00Z' },
  { eventId: 'e4a5b6c7-0005-4d8e-9f0a-1b2c3d4e5f55', actorCode: 'ACT-9C3E', event: 'membresia.revocada', resourceCode: 'MEM-C9E3', result: 'denegado', occurredAt: '2026-09-24T13:05:00Z', reason: 'Sin step-up reciente.' },
];
