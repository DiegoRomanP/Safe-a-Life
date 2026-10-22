import type { CorrectionRequest, DonorInvitation, DonorProfile, ResponseHistoryItem } from './types.js';

// Datos sintéticos de demostración, tomados de Penpot (DON-02 a DON-05). Solo
// existen en memoria mientras no hay cliente HTTP (D-4).
const instructions = 'Preséntate en admisión de donantes con un documento de identidad.';

export const demoInvitations: DonorInvitation[] = [
  {
    invitationId: '7f21c3a0-1b2c-4d5e-8f90-0a1b2c3d4e51',
    hospitalName: 'Hospital Nacional Central',
    publicSiteName: 'Sede San Borja',
    requiredBloodType: 'A_POS',
    urgency: 'Urgente',
    instructions,
    expiresAt: '2026-09-24T23:00:00Z',
    validity: 'activa',
    delivery: 'entregada',
    response: 'sin_respuesta',
  },
  {
    invitationId: '2a09d4b1-2c3d-4e5f-9a01-1b2c3d4e5f62',
    hospitalName: 'Hospital Metropolitano Sur',
    publicSiteName: 'Sede Barranco',
    requiredBloodType: 'A_POS',
    urgency: 'Normal',
    instructions,
    expiresAt: '2026-09-25T14:00:00Z',
    validity: 'activa',
    delivery: 'entregada',
    response: 'confirmada',
  },
  {
    invitationId: '18d4e5c2-3d4e-4f60-8b12-2c3d4e5f6a73',
    hospitalName: 'Instituto Regional Lima',
    publicSiteName: 'Sede Cercado',
    requiredBloodType: 'A_POS',
    urgency: 'Critica',
    instructions,
    expiresAt: '2026-09-25T17:30:00Z',
    validity: 'activa',
    delivery: 'entregada',
    response: 'sin_respuesta',
  },
];

export const demoHistory: ResponseHistoryItem[] = [
  { invitationId: '2a09d4b1-2c3d-4e5f-9a01-1b2c3d4e5f62', response: 'confirmada', changedAt: '2026-09-25T15:32:00Z' },
];

export const demoProfile: DonorProfile = {
  name: 'Daniela Pérez',
  email: 'daniela.perez@example.test',
  declaredBloodType: 'A_POS',
  isAvailable: true,
  approximateLocation: { latitude: -12.091, longitude: -77.001 },
};

export const demoRequests: CorrectionRequest[] = [
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
  },
  {
    requestId: '18d4cad5-6a7b-4c93-9e45-5f6a7b8c9da6',
    type: 'correccion',
    requestedFields: ['name'],
    status: 'rechazada',
    createdAt: '2026-08-19T16:20:00Z',
    updatedAt: '2026-08-20T14:05:00Z',
  },
];
