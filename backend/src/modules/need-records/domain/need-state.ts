/** Estados de una necesidad (V8). Puro: sin reloj propio, Express, Supabase ni I/O. */
export const NEED_STATUSES = ['borrador', 'activa', 'meta_alcanzada', 'cerrada', 'cancelada', 'vencida'] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

/** Destinos que el cliente puede solicitar. `meta_alcanzada` y `vencida` los calcula el sistema. */
export type ManualNeedStatus = 'activa' | 'cerrada' | 'cancelada';

const TERMINAL: ReadonlySet<NeedStatus> = new Set(['cerrada', 'cancelada', 'vencida']);

/** Matriz manual C-8. Los estados terminales no aparecen como origen: no se reabren. */
const MANUAL_TRANSITIONS: Readonly<Partial<Record<NeedStatus, readonly ManualNeedStatus[]>>> = Object.freeze({
  borrador: ['activa', 'cancelada'],
  activa: ['cerrada', 'cancelada'],
  meta_alcanzada: ['cerrada', 'cancelada'],
});

export function isTerminal(status: NeedStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionManually(from: NeedStatus, to: NeedStatus): boolean {
  return (MANUAL_TRANSITIONS[from] as readonly NeedStatus[] | undefined)?.includes(to) ?? false;
}

const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/** Microsegundos desde la época; PostgreSQL guarda microsegundos y `Date` solo milisegundos. */
function toMicros(instant: string): bigint {
  const match = INSTANT.exec(instant);
  const seconds = match ? Date.parse(`${match[1]}Z`) : Number.NaN;
  if (Number.isNaN(seconds)) throw new RangeError('Instante no válido.');
  const micros = (match?.[2] ?? '').padEnd(6, '0').slice(0, 6);
  return BigInt(seconds) * 1000n + BigInt(micros);
}

/**
 * Estado visible: un estado no terminal cuyo `expires_at` ya pasó se proyecta como `vencida`
 * (también un borrador). Un estado terminal conserva su valor.
 */
export function projectStatus(status: NeedStatus, expiresAt: string, now: Date): NeedStatus {
  if (isTerminal(status)) return status;
  return toMicros(expiresAt) <= BigInt(now.getTime()) * 1000n ? 'vencida' : status;
}

export type TransitionVerdict = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'terminal' | 'not_allowed' }>;

/**
 * Evalúa una transición solicitada sobre el estado ALMACENADO. Lo que ya venció cuenta como terminal,
 * de modo que `borrador → activa` exige `now < expires_at` sin regla especial. Ambos rechazos son un
 * conflicto de estado para el cliente; la distinción sirve a las pruebas y a la auditoría.
 */
export function evaluateManualTransition(stored: NeedStatus, expiresAt: string, now: Date, target: NeedStatus): TransitionVerdict {
  if (isTerminal(projectStatus(stored, expiresAt, now))) return { ok: false, reason: 'terminal' };
  return canTransitionManually(stored, target) ? { ok: true } : { ok: false, reason: 'not_allowed' };
}
