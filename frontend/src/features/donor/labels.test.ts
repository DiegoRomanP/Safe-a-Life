import { describe, expect, it } from 'vitest';
import { urgencyLabel } from './labels.js';

describe('urgencyLabel', () => {
  it('usa tonos de urgencia propios, distintos del error y de la marca (A4)', () => {
    expect(urgencyLabel.Normal.tone).toBe('neutral');
    expect(urgencyLabel.Urgente.tone).toBe('urgent');
    expect(urgencyLabel.Critica.tone).toBe('critical');
  });
});
