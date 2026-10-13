import { describe, expect, it } from 'vitest';
import { createTechnicalSession } from './technical-session.js';
import type { TokenPair } from './session-ports.js';

const pair = (n: number, expiresIn = 600): TokenPair => ({ accessToken: `at-${n}`, refreshToken: `rt-${n}`, expiresIn });

function harness(options: { refresh?: (token: string) => TokenPair | null; signIn?: () => TokenPair | null } = {}) {
  let clock = 1_000_000;
  const calls = { signIn: 0, refresh: [] as string[] };
  let counter = 0;
  const session = createTechnicalSession({
    now: () => clock,
    signIn: async () => { calls.signIn += 1; return options.signIn ? options.signIn() : pair(++counter); },
    refresh: async (token) => { calls.refresh.push(token); return options.refresh ? options.refresh(token) : pair(++counter); },
  });
  return { session, calls, advance: (ms: number) => { clock += ms; } };
}

describe('sesión técnica', () => {
  it('inicia sesión una vez y reutiliza el token mientras no esté por vencer', async () => {
    const { session, calls, advance } = harness();

    expect(await session.accessToken()).toBe('at-1');
    advance(500_000);
    expect(await session.accessToken()).toBe('at-1');
    expect(calls.signIn).toBe(1);
    expect(calls.refresh).toEqual([]);
  });

  it('renueva con el refresh token cuando faltan menos de 60 s', async () => {
    const { session, calls, advance } = harness();
    await session.accessToken();
    advance(541_000);

    expect(await session.accessToken()).toBe('at-2');
    expect(calls.refresh).toEqual(['rt-1']);
    expect(calls.signIn).toBe(1);
  });

  it('si el refresh falla vuelve a iniciar sesión', async () => {
    const { session, calls, advance } = harness({ refresh: () => null });
    await session.accessToken();
    advance(600_000);

    expect(await session.accessToken()).toBe('at-2');
    expect(calls.signIn).toBe(2);
  });

  it('peticiones simultáneas comparten una sola renovación (single-flight)', async () => {
    const { session, calls } = harness();

    const tokens = await Promise.all(Array.from({ length: 10 }, () => session.accessToken()));

    expect(new Set(tokens).size).toBe(1);
    expect(calls.signIn).toBe(1);
  });

  it('un inicio de sesión fallido lanza sin cachear el fallo; el siguiente intento reintenta', async () => {
    let attempts = 0;
    const { session, calls } = harness({ signIn: () => (++attempts === 1 ? null : pair(9)) });

    await expect(session.accessToken()).rejects.toThrow('sesión técnica');
    expect(await session.accessToken()).toBe('at-9');
    expect(calls.signIn).toBe(2);
  });

  it('invalidate fuerza un nuevo ciclo de renovación', async () => {
    const { session, calls } = harness();
    await session.accessToken();

    session.invalidate();

    expect(await session.accessToken()).toBe('at-2');
    expect(calls.signIn).toBe(2);
  });
});
