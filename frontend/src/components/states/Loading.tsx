import { StatePanel } from './StatePanel.js';

export type LoadingProps = { message: string; detail?: string; className?: string };

// role="status" anuncia la carga sin interrumpir. La página mantiene la
// estructura visible y marca aria-busy en la región que se actualiza.
export function Loading({ message, detail, className }: LoadingProps) {
  return (
    <StatePanel
      role="status"
      tone="info"
      symbol="…"
      title="Cargando"
      message={message}
      detail={detail}
      className={className}
    />
  );
}
