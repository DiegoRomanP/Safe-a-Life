import type { ReactNode } from 'react';
import { StatePanel } from './StatePanel.js';

export type EmptyStateProps = { message: string; detail?: string; action?: ReactNode; className?: string };

export function EmptyState({ message, detail, action, className }: EmptyStateProps) {
  return (
    <StatePanel
      tone="neutral"
      symbol="○"
      title="Sin resultados"
      message={message}
      detail={detail}
      action={action}
      className={className}
    />
  );
}
