import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/demoApi.js';
import { tokenStatusFor } from './tokenStatus.js';

describe('tokenStatusFor', () => {
  it.each([[410, 'expired'], [400, 'invalid'], [404, 'invalid'], [409, 'invalid'], [429, null], [503, null]] as const)(
    'el estado %i del enlace se muestra como %s', (status, expected) => {
      expect(tokenStatusFor(new ApiError('red', status))).toBe(expected);
    },
  );

  it('un fallo de red no dice nada del enlace', () => {
    expect(tokenStatusFor(new TypeError('sin red'))).toBeNull();
  });
});
