/** Política de reintentos de correo (V7 / RF-EML-02). Pura: el azar llega como argumento. */
export const MAX_CALLS = 6;
export const BACKOFF_MINUTES: readonly number[] = Object.freeze([1, 2, 5, 10, 20]);

/**
 * Retardo hasta la siguiente llamada tras `callsMade` llamadas, con jitter uniforme de ±20 %.
 * `random` ∈ [0, 1]. Devuelve `null` si ya no quedan llamadas o el número es inválido.
 */
export function nextDelayMs(callsMade: number, random: number): number | null {
  if (!(random >= 0 && random <= 1)) throw new RangeError('random fuera de [0, 1].');
  if (!Number.isInteger(callsMade) || callsMade < 1 || callsMade >= MAX_CALLS) return null;
  return BACKOFF_MINUTES[callsMade - 1] * 60_000 * (1 + (random * 0.4 - 0.2));
}

export type CallOutcome =
  | Readonly<{ type: 'response'; status: number }>
  | Readonly<{ type: 'network' | 'timeout'; bodySent: boolean }>;

export type OutcomeClass = 'ok' | 'transitorio' | 'permanente' | 'incierto';

/** RF-EML-02: lo que ocurrió después de enviar el body no se puede dar por perdido ni por entregado. */
export function classify(outcome: CallOutcome): OutcomeClass {
  if (outcome.type !== 'response') return outcome.bodySent ? 'incierto' : 'transitorio';
  const { status } = outcome;
  if (status >= 200 && status < 300) return 'ok';
  if (status === 408 || status === 429 || status >= 500) return 'transitorio';
  if (status >= 400) return 'permanente';
  return 'transitorio';
}
