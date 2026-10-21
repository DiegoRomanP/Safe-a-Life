import type { AriaRole, ReactNode } from 'react';
import { cx } from '../ui/cx.js';

export type StateTone = 'info' | 'neutral' | 'success' | 'warning';

export type StatePanelProps = {
  tone: StateTone;
  symbol: string;
  title: string;
  message: string;
  detail?: string;
  action?: ReactNode;
  role?: AriaRole;
  className?: string;
};

const accent: Record<StateTone, string> = {
  info: 'bg-soft-blue',
  neutral: 'bg-neutral-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
};

// Base común de la «Galería de estados» de Penpot: franja de acento, ícono en
// círculo, título, mensaje, detalle y acción opcional.
export function StatePanel({ tone, symbol, title, message, detail, action, role, className }: StatePanelProps) {
  return (
    <div role={role} className={cx('overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <div aria-hidden="true" className={cx('h-2', accent[tone])} />
      <div className="flex flex-col gap-2 p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cx('flex size-12 items-center justify-center rounded-full text-xl text-ink', accent[tone])}
          >
            {symbol}
          </span>
          <p className="text-lg font-semibold text-ink">{title}</p>
        </div>
        <p className="text-base text-ink">{message}</p>
        {detail && <p className="text-sm text-muted">{detail}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
