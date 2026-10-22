import type { AccountEraser, PrivacyPurgeRepository } from './privacy-requests.ports.js';

export interface PurgeJobDependencies {
  readonly repository: PrivacyPurgeRepository;
  readonly ledgerHmac: (userId: string) => string;
  /** Sin adaptador de producción (ADR-006): sin él no se borran cuentas de Auth y el resto de las purgas sigue. */
  readonly eraser?: AccountEraser;
}

export type PurgeSummary = Readonly<{ purged: number; failedRequests: number; erasedAccounts: number; closedDeletions: number; skipped: number }>;

/**
 * Purgas del worker (RNF-PRV, decisión 8). La base purga lo suyo en una sola RPC; aquí se completa lo que necesita Auth:
 * cuentas reclamadas e incompletas con más de 30 días y eliminaciones a las que solo falta el ledger. Una cuenta que no se
 * puede borrar no detiene las demás: se cuenta y se reintenta en la siguiente pasada. Nada de lo que devuelve contiene ids.
 */
export function createPurgeJob({ repository, ledgerHmac, eraser }: PurgeJobDependencies) {
  return Object.freeze({
    async runOnce(): Promise<PurgeSummary> {
      const report = await repository.purge();
      let closedDeletions = 0;
      let erasedAccounts = 0;
      let skipped = 0;

      for (const { requestId, donorId } of report.pendingDeletions) {
        try {
          await repository.finishDeletion(requestId, ledgerHmac(donorId));
          closedDeletions += 1;
        } catch {
          skipped += 1;
        }
      }
      for (const accountId of report.staleAccounts) {
        if (eraser === undefined) { skipped += 1; continue; }
        try {
          await eraser.deleteAccount(accountId);
          erasedAccounts += 1;
        } catch {
          skipped += 1;
        }
      }
      return Object.freeze({
        purged: Object.values(report.purged).reduce((total, count) => total + count, 0),
        failedRequests: report.failedRequests, erasedAccounts, closedDeletions, skipped,
      });
    },
  });
}

export type PurgeJob = ReturnType<typeof createPurgeJob>;
