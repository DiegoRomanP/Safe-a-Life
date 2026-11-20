import { cx } from './cx.js';

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Id del texto visible que nombra el interruptor. */
  labelledBy: string;
  describedBy?: string;
  onLabel?: string;
  offLabel?: string;
};

// Interruptor accesible (role="switch"): el estado se dice con texto además del color y la perilla se desliza
// (la transición se anula con prefers-reduced-motion en styles.css).
export function Switch({ checked, onChange, labelledBy, describedBy, onLabel = 'Disponible', offLabel = 'No disponible' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-12 w-full max-w-[220px] items-center gap-3 rounded-full border px-3 font-semibold transition-[color,background-color,border-color] duration-200',
        checked ? 'border-success bg-success-soft text-success' : 'border-muted bg-neutral-soft text-muted',
      )}
    >
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-surface ring-1 ring-current">
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200 ease-out',
            checked ? 'translate-x-5 bg-success' : 'translate-x-0 bg-muted',
          )}
        />
      </span>
      {checked ? onLabel : offLabel}
    </button>
  );
}
