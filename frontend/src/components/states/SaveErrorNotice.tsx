import type { ApiErrorKind } from '../../lib/demoApi.js';
import { Alert } from '../ui/Alert.js';
import { ConflictNotice } from './ConflictNotice.js';

export type SaveErrorNoticeProps = {
  error: ApiErrorKind | null;
  /** Para un conflicto: vuelve a cargar los datos actuales antes de reintentar. */
  onReview: () => void;
  /** Texto de «validacion» propio de la pantalla; por defecto el del perfil. */
  validationDetail?: string;
  className?: string;
};

// Resultado de una escritura fallida. Nada cambió: lo dice explícitamente para
// que la persona no crea que su respuesta o cambio quedó registrado.
export function SaveErrorNotice({ error, onReview, validationDetail, className }: SaveErrorNoticeProps) {
  if (!error) return null;
  if (error === 'conflicto') {
    return (
      <ConflictNotice
        onReview={onReview}
        detail="Otro cambio llegó antes y el tuyo no se guardó. Revisa los datos actuales antes de continuar."
        className={className}
      />
    );
  }
  return (
    <Alert tone="danger" title="No se guardó" className={className}>
      {error === 'sin_permiso'
        ? 'Tu cuenta no puede realizar esta acción. No se registró ningún cambio.'
        : error === 'validacion'
          ? `${validationDetail ?? 'El servidor rechazó los datos: revisa que la ubicación aproximada esté dentro de Lima.'} No se registró ningún cambio.`
          : error === 'limite'
            ? 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo. No se registró ningún cambio.'
            : 'No pudimos conectar. No se registró ningún cambio; intenta nuevamente.'}
    </Alert>
  );
}
