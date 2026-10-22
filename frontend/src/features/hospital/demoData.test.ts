import { describe, expect, it } from 'vitest';
import { demoBatches, demoNeeds, demoResponses } from './demoData.js';

describe('datos de demostración del hospital', () => {
  it.each(demoNeeds.map((need) => [need.needId.slice(0, 4), need] as const))(
    'en %s, confirmedIntentCount coincide con las respuestas confirmadas',
    (_code, need) => {
      const confirmed = (demoResponses[need.needId] ?? []).filter((item) => item.response === 'confirmada');
      expect(confirmed).toHaveLength(need.confirmedIntentCount);
    },
  );

  it.each(Object.keys(demoBatches).map((needId) => [needId.slice(0, 4), needId] as const))(
    'en %s, las invitaciones de los lotes suman las respuestas y sus entregas',
    (_code, needId) => {
      const batches = demoBatches[needId] ?? [];
      const invitations = batches.reduce((total, batch) => total + batch.createdInvitationCount, 0);
      expect(invitations).toBe((demoResponses[needId] ?? []).length);
      for (const batch of batches) {
        const counts = Object.values(batch.deliveryCounts).reduce((total, value) => total + value, 0);
        expect(counts).toBe(batch.createdInvitationCount);
      }
    },
  );

  it('todos los códigos por necesidad respetan el mínimo de 8 caracteres', () => {
    const codes = Object.values(demoResponses).flat().map((item) => item.needDonorCode);
    expect(codes.every((code) => code.length >= 8)).toBe(true);
  });
});
