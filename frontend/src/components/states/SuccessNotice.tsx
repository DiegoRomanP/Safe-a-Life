import type { ReactNode } from 'react';
import { StatePanel } from './StatePanel.js';

export type SuccessNoticeProps = {
  message: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
  // false cuando la página ya lo envuelve en una región aria-live persistente,
  // para no anidar regiones y evitar anuncios dobles.
  announce?: boolean;
};

export function SuccessNotice({ message, detail, action, className, announce = true }: SuccessNoticeProps) {
  return (
    <StatePanel
      role={announce ? 'status' : undefined}
      tone="success"
      symbol="✓"
      title="Acción completada"
      message={message}
      detail={detail}
      action={action}
      className={className}
    />
  );
}
