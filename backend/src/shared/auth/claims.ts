import type { VerifiedClaims } from './session-ports.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrae solo lo que el backend necesita de los claims del JWT; cualquier forma inesperada es `null`. */
export function parseClaims(claims: unknown): VerifiedClaims | null {
  if (typeof claims !== 'object' || claims === null) return null;
  const { sub, session_id: sessionId, aal, role, amr } = claims as Record<string, unknown>;
  if (typeof sub !== 'string' || !UUID.test(sub)) return null;
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  if (role !== 'authenticated' || (aal !== 'aal1' && aal !== 'aal2')) return null;

  const methods: Array<{ method: string; timestamp: number }> = [];
  if (amr !== undefined) {
    if (!Array.isArray(amr)) return null;
    for (const entry of amr) {
      if (typeof entry !== 'object' || entry === null) return null;
      const { method, timestamp } = entry as Record<string, unknown>;
      if (typeof method !== 'string' || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
      methods.push(Object.freeze({ method, timestamp }));
    }
  }
  return Object.freeze({ userId: sub, sessionId, aal, amr: Object.freeze(methods) });
}
