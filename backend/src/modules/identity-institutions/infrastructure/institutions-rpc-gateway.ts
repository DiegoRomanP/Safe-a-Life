import { pageOf } from '../../../shared/persistence/page.js';
import {
  asArray, asBoolean, asNullableString, asNumber, asString, closedRecord, oneOf,
} from '../../../shared/persistence/guards.js';
import type { RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import type {
  AuditEventView, ConfigurationView, HospitalView, InstitutionsRepository, MembershipView, OwnSiteView, SiteView, TaskView,
} from '../application/institutions.ports.js';

export function parseHospital(value: unknown): HospitalView {
  const row = closedRecord(value, ['hospitalId', 'publicName', 'legalName', 'isAuthorized', 'createdAt']);
  return Object.freeze({
    hospitalId: asString(row.hospitalId), publicName: asString(row.publicName), legalName: asString(row.legalName),
    isAuthorized: asBoolean(row.isAuthorized), createdAt: asString(row.createdAt),
  });
}

export function parseSite(value: unknown): SiteView {
  const row = closedRecord(value, [
    'siteId', 'hospitalId', 'publicName', 'publicAddress', 'coordinates', 'publicInstructions', 'isActive', 'isApproved',
  ]);
  const coordinates = closedRecord(row.coordinates, ['latitude', 'longitude']);
  return Object.freeze({
    siteId: asString(row.siteId), hospitalId: asString(row.hospitalId), publicName: asString(row.publicName),
    publicAddress: asString(row.publicAddress),
    coordinates: Object.freeze({ latitude: asNumber(coordinates.latitude), longitude: asNumber(coordinates.longitude) }),
    publicInstructions: asNullableString(row.publicInstructions),
    isActive: asBoolean(row.isActive), isApproved: asBoolean(row.isApproved),
  });
}

export function parseMembership(value: unknown): MembershipView {
  const row = closedRecord(value, ['membershipId', 'hospitalId', 'role', 'status', 'emailHint']);
  return Object.freeze({
    membershipId: asString(row.membershipId), hospitalId: asString(row.hospitalId),
    role: oneOf(row.role, ['admin_hospitalario'] as const), status: oneOf(row.status, ['pendiente', 'activa', 'revocada'] as const),
    emailHint: asString(row.emailHint),
  });
}

function parseAuditEvent(value: unknown): AuditEventView {
  const row = closedRecord(value, ['eventId', 'actorCode', 'event', 'resourceCode', 'result', 'occurredAt'], ['reason']);
  return Object.freeze({
    eventId: asString(row.eventId), actorCode: asString(row.actorCode), event: asString(row.event),
    resourceCode: asString(row.resourceCode), result: asString(row.result), occurredAt: asString(row.occurredAt),
    ...(row.reason === undefined ? {} : { reason: asString(row.reason) }),
  });
}

function parseTask(value: unknown): TaskView {
  const row = closedRecord(value, ['taskId', 'kind', 'createdAt', 'resourceCode']);
  return Object.freeze({
    taskId: asString(row.taskId), kind: asString(row.kind), createdAt: asString(row.createdAt), resourceCode: asString(row.resourceCode),
  });
}

function parseOwnSite(value: unknown): OwnSiteView {
  const row = closedRecord(value, ['siteId', 'publicName']);
  return Object.freeze({ siteId: asString(row.siteId), publicName: asString(row.publicName) });
}

function parseConfiguration(reply: Record<string, unknown>): ConfigurationView {
  return Object.freeze({ finalDemoAt: asNullableString(reply.finalDemoAt), isImmutable: asBoolean(reply.isImmutable) });
}

/** Adaptador RPC de instituciones: nombres de función SQL, argumentos `p_*` y guards cerrados viven solo aquí. */
export function createInstitutionsRpcGateway(rpc: RpcInvoker): InstitutionsRepository {
  const repository: InstitutionsRepository = {
    async listHospitals(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_hospitals', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseHospital);
    },

    async createHospital(accessToken, { key, hash }, input) {
      const reply = await rpc({
        accessToken, name: 'create_hospital', okKinds: ['created'],
        args: { p_key: key, p_hash: hash, p_public_name: input.publicName, p_legal_name: input.legalName },
      });
      return parseHospital(reply.hospital);
    },

    async getHospital(accessToken, hospitalId) {
      const reply = await rpc({ accessToken, name: 'get_hospital', okKinds: ['ok'], args: { p_id: hospitalId } });
      return parseHospital(reply.hospital);
    },

    async updateHospital(accessToken, { key, hash }, hospitalId, patch) {
      const reply = await rpc({
        accessToken, name: 'update_hospital', okKinds: ['ok'],
        args: {
          p_key: key, p_hash: hash, p_id: hospitalId, p_public_name: patch.publicName ?? null,
          p_legal_name: patch.legalName ?? null, p_is_authorized: patch.isAuthorized ?? null,
        },
      });
      return parseHospital(reply.hospital);
    },

    async listHospitalSites(accessToken, hospitalId) {
      const reply = await rpc({ accessToken, name: 'list_hospital_sites', okKinds: ['ok'], args: { p_hospital_id: hospitalId } });
      return Object.freeze(asArray(reply.items).map(parseSite));
    },

    async createHospitalSite(accessToken, { key, hash }, hospitalId, input) {
      const reply = await rpc({
        accessToken, name: 'create_hospital_site', okKinds: ['created'],
        args: {
          p_key: key, p_hash: hash, p_hospital_id: hospitalId, p_public_name: input.publicName,
          p_public_address: input.publicAddress, p_latitude: input.coordinates.latitude,
          p_longitude: input.coordinates.longitude, p_public_instructions: input.publicInstructions ?? null,
        },
      });
      return parseSite(reply.site);
    },

    async updateHospitalSite(accessToken, { key, hash }, siteId, patch) {
      const reply = await rpc({
        accessToken, name: 'update_hospital_site', okKinds: ['ok'],
        args: {
          p_key: key, p_hash: hash, p_site_id: siteId, p_public_name: patch.publicName ?? null,
          p_public_address: patch.publicAddress ?? null, p_latitude: patch.coordinates?.latitude ?? null,
          p_longitude: patch.coordinates?.longitude ?? null, p_public_instructions: patch.publicInstructions ?? null,
          p_is_active: patch.isActive ?? null, p_is_approved: patch.isApproved ?? null,
        },
      });
      return parseSite(reply.site);
    },

    async listMemberships(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_memberships', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseMembership);
    },

    async revokeMembership(accessToken, { key, hash }, membershipId, reason) {
      const reply = await rpc({
        accessToken, name: 'revoke_membership', okKinds: ['ok'],
        args: { p_key: key, p_hash: hash, p_id: membershipId, p_reason: reason },
      });
      return parseMembership(reply.membership);
    },

    async getConfiguration(accessToken) {
      return parseConfiguration(await rpc({ accessToken, name: 'get_configuration', okKinds: ['ok'], args: {} }));
    },

    async setFinalDemoAt(accessToken, { key, hash }, finalDemoAt) {
      return parseConfiguration(await rpc({
        accessToken, name: 'set_final_demo_at', okKinds: ['ok'], args: { p_key: key, p_hash: hash, p_at: finalDemoAt },
      }));
    },

    async listAuditEvents(accessToken, { limit, cursor }) {
      const reply = await rpc({
        accessToken, name: 'list_audit_events', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_occurred_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null },
      });
      return pageOf(reply, parseAuditEvent);
    },

    async listTasks(accessToken) {
      const reply = await rpc({ accessToken, name: 'list_superadmin_tasks', okKinds: ['ok'], args: {} });
      return Object.freeze(asArray(reply.items).map(parseTask));
    },

    async listOwnSites(accessToken, { limit, afterSiteId }) {
      const reply = await rpc({
        accessToken, name: 'list_own_hospital_sites', okKinds: ['ok'],
        args: { p_limit: limit, p_cursor_site_id: afterSiteId },
      });
      // Esta RPC pagina por id: `next` es el id de la última sede, no un objeto.
      const next = reply.next === null || reply.next === undefined ? null : Object.freeze({ createdAt: '-', id: asString(reply.next) });
      return Object.freeze({ items: Object.freeze(asArray(reply.items).map(parseOwnSite)), next });
    },
  };
  return Object.freeze(repository);
}
