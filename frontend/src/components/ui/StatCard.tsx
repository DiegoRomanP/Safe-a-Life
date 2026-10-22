import { cx } from './cx.js';

export type StatCardAccent = 'petrol' | 'success' | 'warning' | 'danger' | 'muted';

export type StatCardProps = {
  value: number | string;
  label: string;
  hint?: string;
  // Borde izquierdo de color (Penpot, HOS-01 y HOS-05). Es decorativo y
  // siempre va acompañado de la etiqueta.
  accent?: StatCardAccent;
  className?: string;
};

const accentClass: Record<StatCardAccent, string> = {
  petrol: 'border-l-4 border-l-petrol',
  success: 'border-l-4 border-l-success',
  warning: 'border-l-4 border-l-warning',
  danger: 'border-l-4 border-l-danger',
  muted: 'border-l-4 border-l-muted',
};

// Indicador del resumen operativo (p. ej. «4 · Necesidades activas»). Se lee
// en orden: valor, etiqueta y nota.
export function StatCard({ value, label, hint, accent, className }: StatCardProps) {
  return (
    <div
      className={cx(
        'flex flex-col gap-1 rounded-xl border border-line bg-surface p-5',
        accent && accentClass[accent],
        className,
      )}
    >
      <p className="text-3xl font-bold text-ink">{value}</p>
      <p className="font-semibold text-ink">{label}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
