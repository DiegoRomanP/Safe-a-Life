import type { ReactNode } from 'react';
import { StatePanel } from './StatePanel.js';

export type SuccessNoticeProps = { message: string; detail?: string; action?: ReactNode; className?: string };

export function SuccessNotice({ message, detail, action, className }: SuccessNoticeProps) {
  return (
    <StatePanel
      role="status"
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
