import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import { fingerprint, requireIdempotencyKey } from './idempotency.js';

const requestWith = (value: string | undefined) => ({ get: (name: string) => (name === 'idempotency-key' ? value : undefined) }) as unknown as Request;

describe('requireIdempotencyKey', () => {
  it('devuelve la clave válida y lanza BAD_REQUEST si falta o está fuera de rango', () => {
    expect(requireIdempotencyKey(requestWith('a'.repeat(16)))).toBe('a'.repeat(16));
    for (const bad of [undefined, '', 'corta', 'a'.repeat(256)]) {
      expect(() => requireIdempotencyKey(requestWith(bad))).toThrowError(ApiError);
    }
  });
});

describe('fingerprint', () => {
  it('es el SHA-256 del JSON compacto con el orden dado', () => {
    const expected = createHash('sha256').update('{"component":"RBC","radiusKm":10}', 'utf8').digest('hex');

    expect(fingerprint([['component', 'RBC'], ['radiusKm', 10]])).toBe(expected);
  });

  it('cambia con el orden y con el valor', () => {
    expect(fingerprint([['a', 1], ['b', 2]])).not.toBe(fingerprint([['b', 2], ['a', 1]]));
    expect(fingerprint([['a', 1]])).not.toBe(fingerprint([['a', 2]]));
  });
});
