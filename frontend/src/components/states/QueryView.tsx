import { useEffect, useId, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Query } from '../../lib/useDemoQuery.js';
import { cx } from '../ui/cx.js';
import { ErrorState } from './ErrorState.js';
import { ForbiddenState } from './ForbiddenState.js';
import { Loading } from './Loading.js';

// Una carga breve no muestra el panel «Cargando»: evita el destello y el salto
// de alto al cambiar de pestaña. En las pruebas es 0, como la latencia demo.
const LOADING_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 500;

export type QueryViewProps<T> = {
  query: Query<T>;
  loadingMessage: string;
  /** A dónde ofrecer volver si no hay acceso. */
  backTo: string;
  backLabel: string;
  /** Milisegundos antes de mostrar el panel «Cargando»; el anuncio accesible es inmediato. */
  loadingDelayMs?: number;
  /** `reload` vuelve a pedir los datos sin perder el foco (p. ej. tras un conflicto). */
  children: (data: T, reload: () => void) => ReactNode;
};

// Muestra el estado de una carga: «Cargando», error con reintento, sin acceso
// o el contenido. La cabecera de la página queda fuera y siempre visible.
// Mientras carga, la región reserva alto para que el contenido no salte.
// Reintentar o recargar quita el botón pulsado, así que el foco pasa al
// contenedor, que sigue en la página, y no se cae al body.
export function QueryView<T>({
  query,
  loadingMessage,
  backTo,
  backLabel,
  loadingDelayMs = LOADING_DELAY_MS,
  children,
}: QueryViewProps<T>) {
  // Por id y no por ref: `reload` se entrega a children durante el render.
  const regionId = useId();

  function reload() {
    flushSync(() => query.retry());
    document.getElementById(regionId)?.focus();
  }

  const loading = query.status === 'loading';
  let content: ReactNode;
  if (loading) content = <DelayedLoading message={loadingMessage} delayMs={loadingDelayMs} />;
  else if (query.status === 'error')
    content =
      query.kind === 'sin_permiso' ? <ForbiddenState backTo={backTo} backLabel={backLabel} /> : <ErrorState onRetry={reload} />;
  else content = children(query.data, reload);

  return (
    <div
      id={regionId}
      tabIndex={-1}
      aria-busy={loading || undefined}
      className={cx('flex flex-col gap-8 rounded-xl focus:outline-none', loading && 'min-h-96')}
    >
      {content}
    </div>
  );
}

// Se monta de nuevo en cada carga. El mismo elemento role="status" anuncia la
// carga desde el inicio; solo deja de estar oculto visualmente si tarda.
function DelayedLoading({ message, delayMs }: { message: string; delayMs: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return <Loading message={message} className={visible ? undefined : 'sr-only'} />;
}
