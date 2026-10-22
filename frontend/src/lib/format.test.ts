import { describe, expect, it } from 'vitest';
import { bloodTypeLabel, formatDate, formatDateTime } from './format.js';

describe('format', () => {
  it('convierte a hora de Lima con la zona explícita', () => {
    expect(formatDateTime('2026-09-24T23:00:00Z')).toBe('24 sep 2026, 18:00 · Lima, UTC−5');
  });

  it('usa el día de Lima aunque en UTC ya sea el siguiente', () => {
    expect(formatDate('2026-09-23T03:30:00Z')).toBe('22 sep 2026');
  });

  it('muestra el grupo declarado con su símbolo', () => {
    expect(bloodTypeLabel('A_POS')).toBe('A+');
    expect(bloodTypeLabel('AB_NEG')).toBe('AB−');
  });
});
