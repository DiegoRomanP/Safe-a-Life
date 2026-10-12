import { fingerprint } from '../../../shared/http/idempotency.js';
import type {
  Coordinates, HospitalPatch, InstitutionsRepository, PageQuery, SiteInput, SitePatch,
} from './institutions.ports.js';

const nullable = <T>(value: T | undefined): T | null => (value === undefined ? null : value);
const asText = (value: number): string => String(value);
const coordinate = (value: Coordinates | undefined, key: keyof Coordinates): string | null =>
  value === undefined ? null : asText(value[key]);

/**
 * Casos de uso de instituciones. Cada escritura calcula el hash canónico del payload (mismo orden y
 * serialización que `app.fingerprint` en SQL, que lo recalcula) y delega en una sola RPC atómica.
 * Los campos ausentes viajan como null (sin cambio).
 */
export function createInstitutionsService(repository: InstitutionsRepository) {
  return Object.freeze({
    listHospitals: (token: string, query: PageQuery) => repository.listHospitals(token, query),

    createHospital: (token: string, key: string, input: Readonly<{ publicName: string; legalName: string }>) =>
      repository.createHospital(
        token,
        { key, hash: fingerprint([['publicName', input.publicName], ['legalName', input.legalName]]) },
        input,
      ),

    getHospital: (token: string, hospitalId: string) => repository.getHospital(token, hospitalId),

    updateHospital: (token: string, key: string, hospitalId: string, patch: HospitalPatch) =>
      repository.updateHospital(
        token,
        {
          key,
          hash: fingerprint([['hospitalId', hospitalId], ['publicName', nullable(patch.publicName)],
            ['legalName', nullable(patch.legalName)], ['isAuthorized', nullable(patch.isAuthorized)]]),
        },
        hospitalId,
        patch,
      ),

    listHospitalSites: (token: string, hospitalId: string) => repository.listHospitalSites(token, hospitalId),

    createHospitalSite: (token: string, key: string, hospitalId: string, input: SiteInput) =>
      repository.createHospitalSite(
        token,
        {
          key,
          hash: fingerprint([['hospitalId', hospitalId], ['publicName', input.publicName], ['publicAddress', input.publicAddress],
            ['latitude', asText(input.coordinates.latitude)], ['longitude', asText(input.coordinates.longitude)],
            ['publicInstructions', nullable(input.publicInstructions)]]),
        },
        hospitalId,
        input,
      ),

    updateHospitalSite: (token: string, key: string, siteId: string, patch: SitePatch) =>
      repository.updateHospitalSite(
        token,
        {
          key,
          hash: fingerprint([['siteId', siteId], ['publicName', nullable(patch.publicName)],
            ['publicAddress', nullable(patch.publicAddress)], ['latitude', coordinate(patch.coordinates, 'latitude')],
            ['longitude', coordinate(patch.coordinates, 'longitude')], ['publicInstructions', nullable(patch.publicInstructions)],
            ['isActive', nullable(patch.isActive)], ['isApproved', nullable(patch.isApproved)]]),
        },
        siteId,
        patch,
      ),

    listMemberships: (token: string, query: PageQuery) => repository.listMemberships(token, query),

    revokeMembership: (token: string, key: string, membershipId: string, reason: string) =>
      repository.revokeMembership(
        token,
        { key, hash: fingerprint([['membershipId', membershipId], ['status', 'revocada'], ['reason', reason]]) },
        membershipId,
        reason,
      ),

    getConfiguration: (token: string) => repository.getConfiguration(token),

    setFinalDemoAt: (token: string, key: string, finalDemoAt: string) => {
      const iso = new Date(finalDemoAt).toISOString();
      return repository.setFinalDemoAt(token, { key, hash: fingerprint([['finalDemoAt', iso]]) }, iso);
    },

    listAuditEvents: (token: string, query: PageQuery) => repository.listAuditEvents(token, query),

    listTasks: (token: string) => repository.listTasks(token),

    listOwnSites: (token: string, query: Readonly<{ limit: number; afterSiteId: string | null }>) =>
      repository.listOwnSites(token, query),
  });
}

export type InstitutionsService = ReturnType<typeof createInstitutionsService>;
