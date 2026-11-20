import { describe, expect, it } from 'vitest';
import { rememberNull } from './rememberNull.js';

describe('rememberNull', () => {
  it('tras un null no vuelve a pedir', async () => {
    let calls = 0;
    const load = rememberNull(async () => { calls += 1; return null; });
    await load();
    await expect(load()).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it('un resultado con datos se vuelve a pedir en cada llamada (recarga tras conflicto)', async () => {
    let calls = 0;
    const load = rememberNull(async () => { calls += 1; return { version: calls }; });
    await load();
    await expect(load()).resolves.toEqual({ version: 2 });
  });

  it('tras un error, la siguiente llamada vuelve a pedir', async () => {
    let calls = 0;
    const load = rememberNull(async () => { calls += 1; if (calls === 1) throw new Error('red'); return null; });
    await expect(load()).rejects.toThrow('red');
    await expect(load()).resolves.toBeNull();
    expect(calls).toBe(2);
  });
});
