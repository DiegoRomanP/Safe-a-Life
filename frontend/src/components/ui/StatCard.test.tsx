import { describe, expect, it } from 'vitest';
import { accentWhenPending } from './StatCard.js';

describe('accentWhenPending', () => {
  it('usa el acento de alerta solo si hay algo pendiente (M2)', () => {
    expect(accentWhenPending(3, 'danger')).toBe('danger');
    expect(accentWhenPending(1, 'warning')).toBe('warning');
  });

  it('queda neutro cuando el valor es 0', () => {
    expect(accentWhenPending(0, 'danger')).toBe('muted');
  });
});
