import type { DemoActor, DemoState, OwnDonorProfile } from '../domain/model.js';

const DEMO_NEED_DURATION_HOURS = 24;
export const DEMO_HOSPITAL_ID = 'a8b51767-5c30-41fb-bf7a-f90250f9649c';
export const DEMO_SITE_ID = '1d1258c3-b8ab-4cc6-9120-27df68452261';
export const ALTERNATE_HOSPITAL_ID = 'b7d6a5c4-3f2e-41a0-9b8c-76543210fedc';
export const ALTERNATE_SITE_ID = '7c6b5a49-3827-4615-9d0e-123456789abc';

const donorActor: DemoActor = {
  actorId: 'demo-donor-001',
  role: 'donante',
  displayName: 'Donante Demo',
};

const alternateDonorActor: DemoActor = {
  actorId: 'demo-donor-002',
  role: 'donante',
  displayName: 'Donante Alterno',
};

const pendingDonorActor: DemoActor = {
  actorId: 'demo-donor-003',
  role: 'donante',
  displayName: 'Donante Pendiente',
};

const hospitalActor: DemoActor = {
  actorId: 'demo-hospital-admin-001',
  role: 'admin_hospitalario',
  displayName: 'Admin Demo',
  hospitalId: DEMO_HOSPITAL_ID,
  hospitalName: 'Hospital Demo',
};

const alternateHospitalActor: DemoActor = {
  actorId: 'demo-hospital-admin-002',
  role: 'admin_hospitalario',
  displayName: 'Admin Alterno',
  hospitalId: ALTERNATE_HOSPITAL_ID,
  hospitalName: 'Hospital Norte Demo',
};

const superadminActor: DemoActor = {
  actorId: 'demo-superadmin-001',
  role: 'superadmin',
  displayName: 'Superadmin Demo',
};

const donorProfile: OwnDonorProfile = {
  name: 'Donante Demo',
  email: 'donante.demo@example.test',
  declaredBloodType: 'O_POS',
  isAvailable: true,
  approximateLocation: { latitude: -12.046, longitude: -77.043 },
};

const alternateDonorProfile: OwnDonorProfile = {
  name: 'Donante Alterno',
  email: 'alterno.demo@example.test',
  declaredBloodType: 'A_POS',
  isAvailable: true,
  approximateLocation: { latitude: -12.051, longitude: -77.038 },
};

const pendingDonorProfile: OwnDonorProfile = {
  name: 'Donante Pendiente',
  email: 'pendiente.demo@example.test',
  declaredBloodType: 'O_POS',
  isAvailable: true,
  approximateLocation: { latitude: -12.058, longitude: -77.031 },
};

export function createDemoState(): DemoState {
  const expiresAt = new Date(
    Date.now() + DEMO_NEED_DURATION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  return {
    sessions: new Map(),
    loginIdempotency: new Map(),
    logoutIdempotency: new Map(),
    idempotency: new Map(),
    actorsByEmail: new Map([
      ['donante.demo@example.test', donorActor],
      ['alterno.demo@example.test', alternateDonorActor],
      ['pendiente.demo@example.test', pendingDonorActor],
      ['hospital.demo@example.test', hospitalActor],
      ['hospital.norte.demo@example.test', alternateHospitalActor],
      ['superadmin.demo@example.test', superadminActor],
    ]),
    donors: new Map([
      [donorActor.actorId, structuredClone(donorProfile)],
      [alternateDonorActor.actorId, structuredClone(alternateDonorProfile)],
      [pendingDonorActor.actorId, structuredClone(pendingDonorProfile)],
    ]),
    siteHospitalIds: new Map([
      [DEMO_SITE_ID, DEMO_HOSPITAL_ID],
      [ALTERNATE_SITE_ID, ALTERNATE_HOSPITAL_ID],
    ]),
    needs: [
      {
        needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
        hospitalId: hospitalActor.hospitalId!,
        component: 'RBC',
        requiredBloodType: 'O_POS',
        targetConfirmations: 5,
        siteId: DEMO_SITE_ID,
        radiusKm: 10,
        urgency: 'Urgente',
        status: 'activa',
        expiresAt,
      },
      {
        needId: 'd3ed0c32-264b-4b25-858c-3f8aa1b6678f',
        hospitalId: ALTERNATE_HOSPITAL_ID,
        component: 'RBC',
        requiredBloodType: 'A_POS',
        targetConfirmations: 2,
        siteId: ALTERNATE_SITE_ID,
        radiusKm: 8,
        urgency: 'Normal',
        status: 'activa',
        expiresAt,
      },
    ],
    invitations: [
      {
        invitationId: '76eb9a7c-484f-4478-9a6f-01a21710ce8f',
        needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
        donorId: donorActor.actorId,
        needDonorCode: 'ND-4F8E-21',
        hospitalName: hospitalActor.hospitalName!,
        publicSiteName: 'Sede Centro',
        requiredBloodType: 'O_POS',
        urgency: 'Urgente',
        instructions:
          'Presenta este código al personal del hospital; el equipo médico verificará elegibilidad.',
        validity: 'activa',
        delivery: 'entregada',
        response: 'confirmada',
        responseRecordedAt: new Date().toISOString(),
      },
      {
        invitationId: 'c56009c1-193e-47d8-88b0-95724b7eaf10',
        needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
        donorId: alternateDonorActor.actorId,
        needDonorCode: 'ND-52AB-63',
        hospitalName: hospitalActor.hospitalName!,
        publicSiteName: 'Sede Centro',
        requiredBloodType: 'O_POS',
        urgency: 'Urgente',
        instructions:
          'Presenta este código al personal del hospital; el equipo médico verificará elegibilidad.',
        validity: 'activa',
        delivery: 'entregada',
        response: 'confirmada',
        responseRecordedAt: new Date().toISOString(),
      },
      {
        invitationId: '8db9b15d-2d84-4c42-97bb-2214571f8301',
        needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
        donorId: pendingDonorActor.actorId,
        needDonorCode: 'ND-91CE-44',
        hospitalName: hospitalActor.hospitalName!,
        publicSiteName: 'Sede Centro',
        requiredBloodType: 'O_POS',
        urgency: 'Urgente',
        instructions:
          'Presenta este código al personal del hospital; el equipo médico verificará elegibilidad.',
        validity: 'activa',
        delivery: 'entregada',
        response: 'sin_respuesta',
        responseRecordedAt: null,
      },
    ],
    responseHistory: [
      {
        donorId: donorActor.actorId,
        invitationId: '76eb9a7c-484f-4478-9a6f-01a21710ce8f',
        response: 'confirmada',
        changedAt: new Date().toISOString(),
      },
      {
        donorId: alternateDonorActor.actorId,
        invitationId: 'c56009c1-193e-47d8-88b0-95724b7eaf10',
        response: 'confirmada',
        changedAt: new Date().toISOString(),
      },
    ],
    correctionRequests: [],
    invitationBatches: [],
  };
}
