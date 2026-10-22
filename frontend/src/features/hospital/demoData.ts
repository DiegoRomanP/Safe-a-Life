import type { HospitalNeed, HospitalSite, NeedResponse } from './types.js';

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
