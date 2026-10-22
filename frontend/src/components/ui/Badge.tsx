import { cx } from './cx.js';
import { toneClass, type Tone } from './tones.js';

export type BadgeProps = {
  tone?: Tone;
  children: string;
  className?: string;
};

// Píldora de estado de 28 px (Penpot: Activa, Meta alcanzada, Pendiente,
// Cancelada, Borrador). El texto es obligatorio: el color nunca va solo.
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex min-h-7 items-center rounded-full px-3 text-sm font-semibold',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
