import { Button } from '../ui/Button.js';
import { StatePanel } from './StatePanel.js';

export type ErrorStateProps = { onRetry: () => void; message?: string; detail?: string; className?: string };

// Falla de red o del servidor al cargar. Se anuncia con role="alert" y ofrece
// reintentar; no muestra detalles técnicos ni la ruta pedida.
export function ErrorState({
  onRetry,
  message = 'No pudimos cargar la información',
  detail = 'Revisa tu conexión e intenta nuevamente.',
  className,
}: ErrorStateProps) {
  return (
    <StatePanel
      role="alert"
      tone="warning"
      symbol="!"
      title="Error de conexión"
      message={message}
      detail={detail}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      }
      className={className}
    />
  );
}
