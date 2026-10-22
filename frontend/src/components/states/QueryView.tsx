import { useId, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Query } from '../../lib/useDemoQuery.js';
import { ErrorState } from './ErrorState.js';
import { ForbiddenState } from './ForbiddenState.js';
import { Loading } from './Loading.js';

export type QueryViewProps<T> = {
  query: Query<T>;
  loadingMessage: string;
  /** A dónde ofrecer volver si no hay acceso. */
  backTo: string;
  backLabel: string;
  /** `reload` vuelve a pedir los datos sin perder el foco (p. ej. tras un conflicto). */
  children: (data: T, reload: () => void) => ReactNode;
};

// Muestra el estado de una carga: «Cargando», error con reintento, sin acceso
// o el contenido. La cabecera de la página queda fuera y siempre visible.
// Reintentar o recargar quita el botón pulsado, así que el foco pasa al
// contenedor, que sigue en la página, y no se cae al body.
export function QueryView<T>({ query, loadingMessage, backTo, backLabel, children }: QueryViewProps<T>) {
  // Por id y no por ref: `reload` se entrega a children durante el render.
  const regionId = useId();

  function reload() {
    flushSync(() => query.retry());
    document.getElementById(regionId)?.focus();
  }

  let content: ReactNode;
  if (query.status === 'loading') content = <Loading message={loadingMessage} />;
  else if (query.status === 'error')
    content =
      query.kind === 'sin_permiso' ? <ForbiddenState backTo={backTo} backLabel={backLabel} /> : <ErrorState onRetry={reload} />;
  else content = children(query.data, reload);

  return (
    <div id={regionId} tabIndex={-1} className="flex flex-col gap-8 rounded-xl focus:outline-none">
      {content}
    </div>
  );
}
