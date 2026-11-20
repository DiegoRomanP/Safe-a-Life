import type { ReactNode } from 'react';
import { StatePanel } from './StatePanel.js';

export type EmptyStateProps = { message: string; title?: string; detail?: string; action?: ReactNode; className?: string };

export function EmptyState({ message, title = 'Sin resultados', detail, action, className }: EmptyStateProps) {
  return (
    <StatePanel
      tone="neutral"
      symbol="○"
      title={title}
      message={message}
      detail={detail}
      action={action}
      className={className}
    />
  );
}
