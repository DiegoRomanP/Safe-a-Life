import { describe, expect, it } from 'vitest';
import { createPurgeJob } from './purge-job.js';
import type { PrivacyPurgeRepository, PurgeReport } from './privacy-requests.ports.js';

const REPORT: PurgeReport = {
  purged: { idempotencyRecords: 2, actionTokens: 1, rateLimitEvents: 0, accessGrants: 0, assistedSignups: 1 },
  failedRequests: 1, pendingDeletions: [{ requestId: 'r-1', donorId: 'd-1' }],
};

function harness(options: { authFails?: boolean; finishFails?: boolean; purgeFails?: boolean } = {}) {
  const calls: string[] = [];
  const repository: PrivacyPurgeRepository = {
    purge: async () => { calls.push('purge'); if (options.purgeFails) throw new Error('db'); return REPORT; },
    purgeAuthAccounts: async (limit) => {
      calls.push(`auth:${limit}`);
      if (options.authFails) throw new Error('forbidden');
      return { staleDeleted: 2, inertDeleted: 3 };
    },
    finishDeletion: async (requestId, hmac) => { calls.push(`finish:${requestId}:${hmac}`); if (options.finishFails) throw new Error('x'); },
    failExecution: async () => undefined,
  };
  return { calls, job: createPurgeJob({ repository, ledgerHmac: (id) => `hmac(${id})` }) };
}

describe('purge job', () => {
  it('cierra las eliminaciones a medias y purga las cuentas de Auth por una RPC con límite', async () => {
    const { job, calls } = harness();
    expect(await job.runOnce()).toEqual({ purged: 4, failedRequests: 1, staleAccountsDeleted: 2, inertAccountsDeleted: 3, closedDeletions: 1, skipped: 0 });
    expect(calls).toEqual(['purge', 'finish:r-1:hmac(d-1)', 'auth:500']);
  });

  it('si la RPC de cuentas falla (forbidden, red), el resto sigue y se cuenta como pendiente', async () => {
    const { job } = harness({ authFails: true });
    expect(await job.runOnce()).toMatchObject({ staleAccountsDeleted: 0, inertAccountsDeleted: 0, closedDeletions: 1, skipped: 1 });
  });

  it('un cierre fallido no impide purgar cuentas', async () => {
    const { job, calls } = harness({ finishFails: true });
    expect(await job.runOnce()).toMatchObject({ closedDeletions: 0, skipped: 1, staleAccountsDeleted: 2 });
    expect(calls).toContain('auth:500');
  });

  it('si purge falla, las cuentas de Auth se purgan igual y el fallo se cuenta', async () => {
    const { job, calls } = harness({ purgeFails: true });
    expect(await job.runOnce()).toEqual({ purged: 0, failedRequests: 0, staleAccountsDeleted: 2, inertAccountsDeleted: 3, closedDeletions: 0, skipped: 1 });
    expect(calls).toEqual(['purge', 'auth:500']);
  });

  it('si las cuentas fallan, lo que purge ya hizo se conserva en el resumen', async () => {
    const { job } = harness({ authFails: true });
    expect(await job.runOnce()).toMatchObject({ purged: 4, failedRequests: 1 });
  });

  it('no devuelve ids en el resumen', async () => {
    const { job } = harness();
    expect(JSON.stringify(await job.runOnce())).not.toMatch(/u-1|d-1|r-1/);
  });
});
