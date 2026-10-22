import type { ReactNode } from 'react';

export type PageHeaderProps = { title: string; description: string; actions?: ReactNode };

// Encabezado de las vistas autenticadas: h1, descripción y acción principal
// opcional a la derecha (p. ej. «Guardar cambios»).
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">{title}</h1>
        <p className="text-muted">{description}</p>
      </div>
      {actions}
    </div>
  );
}
