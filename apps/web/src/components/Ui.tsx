import type { ReactNode } from 'react';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`brand-lockup${inverse ? ' brand-lockup--inverse' : ''}`}>
      <span className="brand-symbol" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Save a Life</span>
    </span>
  );
}

export function Notice({
  children,
  tone = 'info',
  title,
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
}) {
  return (
    <aside className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function LoadingState({ label = 'Cargando información' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
      <span className="loading-mark" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Notice tone="error" title="No se pudo cargar esta información">
      <p>{message}</p>
      <button className="button button--secondary button--small" onClick={onRetry}>
        Intentar de nuevo
      </button>
    </Notice>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-heading__action">{action}</div>}
    </div>
  );
}
