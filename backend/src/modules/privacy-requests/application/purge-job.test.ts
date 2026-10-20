import { describe, expect, it } from 'vitest';
import { createPurgeJob } from './purge-job.js';
import type { PrivacyPurgeRepository, PurgeReport } from './privacy-requests.ports.js';

const REPORT: PurgeReport = {
  purged: { idempotencyRecords: 2, actionTokens: 1, rateLimitEvents: 0, accessGrants: 0, assistedSignups: 1 },
  failedRequests: 1, staleAccounts: ['u-1', 'u-2'], pendingDeletions: [{ requestId: 'r-1', donorId: 'd-1' }],
};

function harness(report: PurgeReport = REPORT, eraseFails: readonly string[] = []) {
  const calls: string[] = [];
  const repository: PrivacyPurgeRepository = {
    purge: async () => report,
    finishDeletion: async (requestId, hmac) => { calls.push(`finish:${requestId}:${hmac}`); },
    failExecution: async () => undefined,
  };
  return {
    calls,
    job: (withEraser: boolean) => createPurgeJob({
      repository, ledgerHmac: (id) => `hmac(${id})`,
      ...(withEraser ? { eraser: { deleteAccount: async (id: string) => { calls.push(`erase:${id}`); if (eraseFails.includes(id)) throw new Error('auth'); } } } : {}),
    }),
  };
}

describe('purge job', () => {
  it('cierra las eliminaciones a medias con el HMAC y borra las cuentas vencidas', async () => {
    const { job, calls } = harness();
    expect(await job(true).runOnce()).toEqual({ purged: 4, failedRequests: 1, erasedAccounts: 2, closedDeletions: 1, skipped: 0 });
    expect(calls).toEqual(['finish:r-1:hmac(d-1)', 'erase:u-1', 'erase:u-2']);
  });

  it('sin quien borre cuentas, el resto sigue y las cuentas se cuentan como pendientes', async () => {
    const { job, calls } = harness();
    expect(await job(false).runOnce()).toMatchObject({ erasedAccounts: 0, closedDeletions: 1, skipped: 2 });
    expect(calls).toEqual(['finish:r-1:hmac(d-1)']);
  });

  it('una cuenta que no se puede borrar no detiene las demás', async () => {
    const { job, calls } = harness(REPORT, ['u-1']);
    expect(await job(true).runOnce()).toMatchObject({ erasedAccounts: 1, skipped: 1 });
    expect(calls).toContain('erase:u-2');
  });

  it('no devuelve ids en el resumen', async () => {
    const { job } = harness();
    expect(JSON.stringify(await job(true).runOnce())).not.toMatch(/u-1|d-1|r-1/);
  });
});
