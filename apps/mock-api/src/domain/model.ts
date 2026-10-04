import type { components } from '../api/openapi.js';

type Schemas = components['schemas'];

export type ActorRole = Schemas['ActorRole'];
export type NeedStatus = Schemas['NeedStatus'];
export type BloodType = Schemas['BloodType'];
export type Urgency = Schemas['Urgency'];
export type InvitationResponse = Schemas['InvitationResponse'];
export type CorrectionRequestInput = Schemas['CreateCorrectionRequest'];

export type DemoResponseHistoryRecord = Schemas['ResponseHistoryItem'] & { donorId: string };
export type DemoCorrectionRequest = Schemas['CorrectionRequestSummary'] & { donorId: string };
export type DemoInvitationBatchRecord = Schemas['InvitationBatchRecord'] & {
  hospitalId: string;
  needId: string;
};

export interface DemoActor {
  actorId: string;
  role: ActorRole;
  displayName: string;
  hospitalId?: string;
  hospitalName?: string;
}

export interface DemoSession {
  actor: DemoActor;
  csrfToken: string;
  aal: 1 | 2;
  expiresAt: number;
}

export interface OwnDonorProfile {
  name: string;
  email: string;
  declaredBloodType: BloodType;
  isAvailable: boolean;
  approximateLocation: { latitude: number; longitude: number };
}

export interface DemoNeed {
  needId: string;
  hospitalId: string;
  component: 'RBC';
  requiredBloodType: BloodType;
  targetConfirmations: number;
  siteId: string;
  radiusKm: number;
  urgency: Urgency;
  status: NeedStatus;
  expiresAt: string;
}

export interface DemoInvitation {
  invitationId: string;
  needId: string;
  donorId: string;
  needDonorCode: string;
  hospitalName: string;
  publicSiteName: string;
  requiredBloodType: BloodType;
  urgency: Urgency;
  instructions: string;
  validity: 'activa' | 'vencida' | 'invalidada';
  delivery: 'pendiente' | 'enviada' | 'entregada' | 'fallida';
  response: InvitationResponse;
  responseRecordedAt: string | null;
}

export interface DemoState {
  sessions: Map<string, DemoSession>;
  loginIdempotency: Map<string, { payloadHash: string; sessionId: string; responseBody: unknown }>;
  logoutIdempotency: Map<string, { csrfHash: string; expiresAt: number }>;
  idempotency: Map<string, { payloadHash: string; status: number; responseBody: unknown }>;
  actorsByEmail: Map<string, DemoActor>;
  donors: Map<string, OwnDonorProfile>;
  siteHospitalIds: Map<string, string>;
  needs: DemoNeed[];
  invitations: DemoInvitation[];
  responseHistory: DemoResponseHistoryRecord[];
  correctionRequests: DemoCorrectionRequest[];
  invitationBatches: DemoInvitationBatchRecord[];
}
