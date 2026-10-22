import { describe, expect, it } from 'vitest';
import { demoNeeds, demoResponses } from './demoData.js';

describe('datos de demostración del hospital', () => {
  it.each(demoNeeds.map((need) => [need.needId.slice(0, 4), need] as const))(
    'en %s, confirmedIntentCount coincide con las respuestas confirmadas',
    (_code, need) => {
      const confirmed = (demoResponses[need.needId] ?? []).filter((item) => item.response === 'confirmada');
      expect(confirmed).toHaveLength(need.confirmedIntentCount);
    },
  );

  it('todos los códigos por necesidad respetan el mínimo de 8 caracteres', () => {
    const codes = Object.values(demoResponses).flat().map((item) => item.needDonorCode);
    expect(codes.every((code) => code.length >= 8)).toBe(true);
  });
});
