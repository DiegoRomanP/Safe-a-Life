import { Alert } from '../../../components/ui/Alert.js';
import { useSuperadmin } from '../SuperadminContext.js';

// Región aria-live con el motivo de la última acción fallida (role=alert del Alert). Cada página la coloca junto a sus acciones.
export function ActionError() {
  const { actionError } = useSuperadmin();
  return (
    <div aria-live="assertive">
      {actionError && (
        <Alert tone="danger" title="No se pudo completar la acción">
          {actionError}
        </Alert>
      )}
    </div>
  );
}
