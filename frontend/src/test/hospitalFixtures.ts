import type { AssistedSignup, HospitalNeed, HospitalSite } from '../features/hospital/types.js';

// Datos sintéticos de Penpot (HOS-01 a HOS-06) que siembran el backend simulado de las pruebas del hospital.
export const demoSites: HospitalSite[] = [
  { siteId: '5b0a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c21', publicName: 'Sede San Borja' },
  { siteId: '6c1b2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d32', publicName: 'Sede Cercado' },
];

const [sanBorja, cercado] = demoSites as [HospitalSite, HospitalSite];

export const demoNeeds: HospitalNeed[] = [
  {
    needId: 'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01',
    component: 'RBC',
    requiredBloodType: 'A_POS',
    targetConfirmations: 3,
    confirmedIntentCount: 2,
    siteId: sanBorja.siteId,
    radiusKm: 10,
    urgency: 'Urgente',
    status: 'activa',
    expiresAt: '2026-09-24T23:00:00Z',
  },
  {
    needId: '02210d4e-2f3a-4b4c-9d5e-6f7a8b9c0d12',
    component: 'RBC',
    requiredBloodType: 'O_NEG',
    targetConfirmations: 5,
    confirmedIntentCount: 5,
    siteId: sanBorja.siteId,
    radiusKm: 15,
    urgency: 'Critica',
    status: 'meta_alcanzada',
    expiresAt: '2026-09-25T01:30:00Z',
  },
  {
    needId: 'b0870e5f-3a4b-4c5d-8e6f-7a8b9c0d1e23',
    component: 'RBC',
    requiredBloodType: 'B_POS',
    targetConfirmations: 4,
    confirmedIntentCount: 1,
    siteId: cercado.siteId,
    radiusKm: 10,
    urgency: 'Normal',
    status: 'activa',
    expiresAt: '2026-09-25T17:00:00Z',
  },
  {
    needId: 'ab190f6a-4b5c-4d6e-9f7a-8b9c0d1e2f34',
    component: 'RBC',
    requiredBloodType: 'AB_NEG',
    targetConfirmations: 2,
    confirmedIntentCount: 0,
    siteId: cercado.siteId,
    radiusKm: 20,
    urgency: 'Urgente',
    status: 'borrador',
    expiresAt: '2026-09-26T14:00:00Z',
  },
];

export const demoSignups: AssistedSignup[] = [
  {
    signupId: '771a2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b41',
    status: 'pendiente',
    createdAt: '2026-09-24T15:02:00Z',
    activationExpiresAt: '2026-09-25T15:02:00Z',
    purgeAt: '2026-10-24T15:02:00Z',
  },
  {
    signupId: '402b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c52',
    status: 'reclamada_incompleta',
    createdAt: '2026-09-23T21:40:00Z',
    activationExpiresAt: '2026-09-24T21:40:00Z',
    purgeAt: '2026-10-23T21:40:00Z',
  },
  {
    signupId: '189c4d5e-6f7a-4b8c-8d9e-1f2a3b4c5d63',
    status: 'activa',
    createdAt: '2026-09-20T14:18:00Z',
    activationExpiresAt: '2026-09-21T14:18:00Z',
    purgeAt: '2026-10-20T14:18:00Z',
  },
];
