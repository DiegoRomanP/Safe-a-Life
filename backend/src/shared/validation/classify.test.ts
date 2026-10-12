import { describe, expect, it } from 'vitest';
import { classifyValidationFailure } from './classify.js';

describe('classifyValidationFailure', () => {
  it('clasifica como shape los fallos estructurales y los desconocidos', () => {
    expect(classifyValidationFailure(null)).toBe('shape');
    expect(classifyValidationFailure([])).toBe('shape');
    expect(classifyValidationFailure([{ keyword: 'required' }])).toBe('shape');
    expect(classifyValidationFailure([{ keyword: 'oneOf' }])).toBe('shape');
  });

  it('clasifica como rule los fallos de valor sin fallos estructurales', () => {
    expect(classifyValidationFailure([{ keyword: 'enum' }, { keyword: 'minimum' }])).toBe('rule');
  });

  it('prefiere shape cuando hay ambos tipos de fallo', () => {
    expect(classifyValidationFailure([{ keyword: 'maximum' }, { keyword: 'additionalProperties' }])).toBe('shape');
  });
});
