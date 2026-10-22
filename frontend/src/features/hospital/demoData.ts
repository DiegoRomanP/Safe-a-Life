import type { AssistedSignup, HospitalNeed, HospitalSite, InvitationBatch, NeedResponse } from './types.js';

// Datos sintéticos de demostración, tomados de Penpot (HOS-01 a HOS-05). Solo
// existen en memoria mientras no hay cliente HTTP (D-4).
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

const opaque = (
  needDonorCode: string,
  response: 'sin_respuesta' | 'rechazada',
  validity: 'activa' | 'invalidada' | 'vencida' = 'activa',
): NeedResponse => ({ needDonorCode, validity, delivery: 'entregada', response });

const confirmed = (needDonorCode: string, donorName: string, responseRecordedAt: string): NeedResponse => ({
  needDonorCode,
  donorName,
  declaredBloodType: 'O_NEG',
  response: 'confirmada',
  responseRecordedAt,
});

// Cada necesidad tiene tantas respuestas «confirmada» como su
// confirmedIntentCount (lo comprueba demoData.test.ts).
export const demoResponses: Record<string, NeedResponse[]> = {
  '02210d4e-2f3a-4b4c-9d5e-6f7a8b9c0d12': [
    confirmed('N-21A0-01', 'Carla Mendoza', '2026-09-24T15:02:00Z'),
    confirmed('N-21A0-02', 'Jorge Salas', '2026-09-24T15:20:00Z'),
    confirmed('N-21A0-03', 'Rosa Huamán', '2026-09-24T16:05:00Z'),
    confirmed('N-21A0-04', 'Diego Paredes', '2026-09-24T16:48:00Z'),
    confirmed('N-21A0-05', 'Lucía Vargas', '2026-09-24T17:30:00Z'),
    opaque('N-21A0-06', 'sin_respuesta', 'invalidada'),
  ],
  'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01': [
    {
      needDonorCode: 'D-7F2A-01',
      donorName: 'María Torres',
      declaredBloodType: 'A_POS',
      response: 'confirmada',
      responseRecordedAt: '2026-09-24T17:08:00Z',
    },
    {
      needDonorCode: 'D-19BC-02',
      donorName: 'Luis Ramírez',
      declaredBloodType: 'A_POS',
      response: 'confirmada',
      responseRecordedAt: '2026-09-24T17:41:00Z',
    },
    opaque('D-83F2-03', 'sin_respuesta'),
    opaque('D-4C91-04', 'rechazada'),
  ],
  'b0870e5f-3a4b-4c5d-8e6f-7a8b9c0d1e23': [
    opaque('R-0F21-01', 'sin_respuesta'),
    opaque('R-821A-02', 'rechazada'),
    {
      needDonorCode: 'R-419C-03',
      donorName: 'Ana Quispe',
      declaredBloodType: 'B_POS',
      response: 'confirmada',
      responseRecordedAt: '2026-09-24T19:15:00Z',
    },
    opaque('R-7E01-04', 'sin_respuesta', 'vencida'),
    opaque('R-2B66-05', 'rechazada'),
    opaque('R-5D30-06', 'sin_respuesta'),
    opaque('R-9A12-07', 'sin_respuesta'),
    opaque('R-C4E8-08', 'sin_respuesta'),
  ],
};

const delivered = (entregada: number) => ({ pendiente: 0, enviada: 0, entregada, fallida: 0 });

// Lotes por necesidad. Las invitaciones de los lotes suman lo mismo que las
// respuestas de la necesidad (lo comprueba demoData.test.ts).
export const demoBatches: Record<string, InvitationBatch[]> = {
  '02210d4e-2f3a-4b4c-9d5e-6f7a8b9c0d12': [
    { batchId: '0a1b2c3d-0001-4e5f-8a6b-7c8d9e0f1a21', createdAt: '2026-09-24T13:10:00Z', createdInvitationCount: 6, deliveryCounts: delivered(6) },
  ],
  'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01': [
    { batchId: '0a1b2c3d-0002-4e5f-8a6b-7c8d9e0f1a32', createdAt: '2026-09-24T14:32:00Z', createdInvitationCount: 3, deliveryCounts: delivered(3) },
    { batchId: '0a1b2c3d-0003-4e5f-8a6b-7c8d9e0f1a43', createdAt: '2026-09-24T18:08:00Z', createdInvitationCount: 1, deliveryCounts: delivered(1) },
  ],
  'b0870e5f-3a4b-4c5d-8e6f-7a8b9c0d1e23': [
    { batchId: '0a1b2c3d-0004-4e5f-8a6b-7c8d9e0f1a54', createdAt: '2026-09-24T15:00:00Z', createdInvitationCount: 6, deliveryCounts: delivered(6) },
    { batchId: '0a1b2c3d-0005-4e5f-8a6b-7c8d9e0f1a65', createdAt: '2026-09-24T19:40:00Z', createdInvitationCount: 2, deliveryCounts: delivered(2) },
  ],
};

// Altas asistidas (HOS-06). Solo estado y fechas; el contrato no devuelve el
// correo ni el nombre de la persona invitada.
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
