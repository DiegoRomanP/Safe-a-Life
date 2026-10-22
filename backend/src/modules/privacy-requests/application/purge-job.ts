import type { PrivacyPurgeRepository, PurgeReport } from './privacy-requests.ports.js';

export interface PurgeJobDependencies {
  readonly repository: PrivacyPurgeRepository;
  readonly ledgerHmac: (userId: string) => string;
}

export type PurgeSummary = Readonly<{
  purged: number; failedRequests: number; staleAccountsDeleted: number; inertAccountsDeleted: number; closedDeletions: number; skipped: number;
}>;

/** Máximo de la RPC `worker_purge_auth_accounts` (1..500); lo que sobre se purga en la siguiente pasada. */
const AUTH_PURGE_LIMIT = 500;

/**
 * Purgas del worker (RNF-PRV, decisión 8). La base purga lo suyo en una RPC y las cuentas de Auth vencidas (reclamadas e
 * incompletas > 30 días, inertes > 24 h) en otra, ambas con el JWT técnico del worker: sin `service_role` (ADR-003, b2).
 * Un paso que falla no detiene los demás: se cuenta y se reintenta en la siguiente pasada. Nada de lo que devuelve contiene ids.
 */
export function createPurgeJob({ repository, ledgerHmac }: PurgeJobDependencies) {
  return Object.freeze({
    async runOnce(): Promise<PurgeSummary> {
      let closedDeletions = 0;
      let skipped = 0;
      let report: PurgeReport = { purged: {}, failedRequests: 0, pendingDeletions: [] };
      try {
        report = await repository.purge();
      } catch {
        skipped += 1;
      }

      for (const { requestId, donorId } of report.pendingDeletions) {
        try {
          await repository.finishDeletion(requestId, ledgerHmac(donorId));
          closedDeletions += 1;
        } catch {
          skipped += 1;
        }
      }
      let accounts = { staleDeleted: 0, inertDeleted: 0 };
      try {
        accounts = await repository.purgeAuthAccounts(AUTH_PURGE_LIMIT);
      } catch {
        skipped += 1;
      }
      return Object.freeze({
        purged: Object.values(report.purged).reduce((total, count) => total + count, 0),
        failedRequests: report.failedRequests, staleAccountsDeleted: accounts.staleDeleted, inertAccountsDeleted: accounts.inertDeleted,
        closedDeletions, skipped,
      });
    },
  });
}

export type PurgeJob = ReturnType<typeof createPurgeJob>;
