export type { Page, PageQuery } from '../../../shared/persistence/page.js';
import type { Page, PageQuery } from '../../../shared/persistence/page.js';

/** Clave de idempotencia y hash canónico que la RPC recalcula y compara. */
export type Envelope = Readonly<{ key: string; hash: string }>;

export type HospitalView = Readonly<{
  hospitalId: string; publicName: string; legalName: string; isAuthorized: boolean; createdAt: string;
}>;

export type SiteView = Readonly<{
  siteId: string; hospitalId: string; publicName: string; publicAddress: string;
  coordinates: Readonly<{ latitude: number; longitude: number }>;
  publicInstructions: string | null; isActive: boolean; isApproved: boolean;
}>;

export type MembershipView = Readonly<{
  membershipId: string; hospitalId: string; role: 'admin_hospitalario'; status: 'pendiente' | 'activa' | 'revocada'; emailHint: string;
}>;

export type ConfigurationView = Readonly<{ finalDemoAt: string | null; isImmutable: boolean }>;

export type AuditEventView = Readonly<{
  eventId: string; actorCode: string; event: string; resourceCode: string; result: string; occurredAt: string; reason?: string;
}>;

export type TaskView = Readonly<{ taskId: string; kind: string; createdAt: string; resourceCode: string }>;

export type OwnSiteView = Readonly<{ siteId: string; publicName: string }>;

export type HospitalPatch = Readonly<{ publicName?: string; legalName?: string; isAuthorized?: boolean }>;

export type Coordinates = Readonly<{ latitude: number; longitude: number }>;

export type SiteInput = Readonly<{
  publicName: string; publicAddress: string; coordinates: Coordinates; publicInstructions?: string;
}>;

export type SitePatch = Readonly<{
  publicName?: string; publicAddress?: string; coordinates?: Coordinates;
  publicInstructions?: string; isActive?: boolean; isApproved?: boolean;
}>;

/**
 * Puerto de persistencia de instituciones. Todas las operaciones se ejecutan con el JWT del usuario
 * (RPC INVOKER + RLS, ADR-003); cada escritura es una sola RPC atómica.
 */
export interface InstitutionsRepository {
  listHospitals(accessToken: string, query: PageQuery): Promise<Page<HospitalView>>;
  createHospital(accessToken: string, envelope: Envelope, input: Readonly<{ publicName: string; legalName: string }>): Promise<HospitalView>;
  getHospital(accessToken: string, hospitalId: string): Promise<HospitalView>;
  updateHospital(accessToken: string, envelope: Envelope, hospitalId: string, patch: HospitalPatch): Promise<HospitalView>;
  listHospitalSites(accessToken: string, hospitalId: string): Promise<readonly SiteView[]>;
  createHospitalSite(accessToken: string, envelope: Envelope, hospitalId: string, input: SiteInput): Promise<SiteView>;
  updateHospitalSite(accessToken: string, envelope: Envelope, siteId: string, patch: SitePatch): Promise<SiteView>;
  listMemberships(accessToken: string, query: PageQuery): Promise<Page<MembershipView>>;
  revokeMembership(accessToken: string, envelope: Envelope, membershipId: string, reason: string): Promise<MembershipView>;
  getConfiguration(accessToken: string): Promise<ConfigurationView>;
  setFinalDemoAt(accessToken: string, envelope: Envelope, finalDemoAt: string): Promise<ConfigurationView>;
  listAuditEvents(accessToken: string, query: PageQuery): Promise<Page<AuditEventView>>;
  listTasks(accessToken: string): Promise<readonly TaskView[]>;
  listOwnSites(accessToken: string, query: Readonly<{ limit: number; afterSiteId: string | null }>): Promise<Page<OwnSiteView>>;
}
