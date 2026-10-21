import { Button } from '../ui/Button.js';
import { StatePanel } from './StatePanel.js';

export type ConflictNoticeProps = {
  onReview: () => void;
  message?: string;
  detail?: string;
  className?: string;
};

// Conflicto concurrente (p. ej. 409): otro cambio llegó antes. Se anuncia con
// role="alert" porque la persona debe revisar antes de continuar.
export function ConflictNotice({
  onReview,
  message = 'El estado cambió',
  detail = 'Actualizamos la vista. Revisa los datos antes de continuar.',
  className,
}: ConflictNoticeProps) {
  return (
    <StatePanel
      role="alert"
      tone="warning"
      symbol="!"
      title="Conflicto concurrente"
      message={message}
      detail={detail}
      action={
        <Button variant="secondary" onClick={onReview}>
          Revisar cambios
        </Button>
      }
      className={className}
    />
  );
}
