import type { ReactNode } from 'react';
import { cx } from './cx.js';
import { toneClass } from './tones.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'brand';

export type AlertProps = {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  className?: string;
};

const icons: Record<AlertTone, string> = { info: 'i', success: '✓', warning: '!', danger: '×', brand: 'i' };

// El tono se dice también con texto para lectores de pantalla; el ícono es
// decorativo. Los errores usan role="alert" para anunciarse al aparecer.
const toneLabel: Record<AlertTone, string> = {
  info: 'Información',
  brand: 'Información',
  success: 'Correcto',
  warning: 'Aviso',
  danger: 'Error',
};

export function Alert({ tone, title, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cx('flex gap-3 rounded-lg p-4', toneClass[tone], className)}
    >
      <span aria-hidden="true" className="text-lg leading-6 font-bold">
        {icons[tone]}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold">
          <span className="sr-only">{toneLabel[tone]}: </span>
          {title}
        </p>
        {children && <div className="text-sm text-ink">{children}</div>}
      </div>
    </div>
  );
}
