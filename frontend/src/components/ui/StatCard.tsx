import { cx } from './cx.js';

export type StatCardProps = {
  value: number | string;
  label: string;
  hint?: string;
  className?: string;
};

// Indicador del resumen operativo (p. ej. «4 · Necesidades activas»). Se lee
// en orden: valor, etiqueta y nota.
export function StatCard({ value, label, hint, className }: StatCardProps) {
  return (
    <div className={cx('flex flex-col gap-1 rounded-xl border border-line bg-surface p-5', className)}>
      <p className="text-3xl font-bold text-ink">{value}</p>
      <p className="font-semibold text-ink">{label}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
