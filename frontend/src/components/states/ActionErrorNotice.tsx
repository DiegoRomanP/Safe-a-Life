import { Alert } from '../ui/Alert.js';

// Región aria-live con el motivo de la última acción fallida (role=alert del Alert). Cada área la conecta a su contexto
// y cada página la coloca junto a sus acciones.
export function ActionErrorNotice({ message }: { message: string | null | undefined }) {
  return (
    <div aria-live="assertive" className="live-slot">
      {message && (
        <Alert tone="danger" title="No se pudo completar la acción">
          {message}
        </Alert>
      )}
    </div>
  );
}
