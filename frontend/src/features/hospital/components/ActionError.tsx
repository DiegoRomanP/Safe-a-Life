import { Alert } from '../../../components/ui/Alert.js';
import { useHospital } from '../HospitalContext.js';

// Región aria-live con el motivo de la última acción fallida. Cada página la coloca junto a sus acciones.
export function ActionError() {
  const { actionError } = useHospital();
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
