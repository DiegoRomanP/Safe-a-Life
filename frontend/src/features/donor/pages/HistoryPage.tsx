import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Card } from '../../../components/ui/Card.js';
import { cx } from '../../../components/ui/cx.js';
import { formatDateTime } from '../../../lib/format.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { historyLabel } from '../labels.js';

// DON-04 Historial de respuestas (contenido de Penpot «SaL» con estilo «+»).
// listOwnResponseHistory solo devuelve cambios de respuesta; el hospital sale
// de las invitaciones propias. El punto de color es decorativo.
export function HistoryPage() {
  const { history, invitations } = useDonorDemo();
  const hospitalOf = (invitationId: string) =>
    invitations.find((item) => item.invitationId === invitationId)?.hospitalName ?? 'Invitación';

  return (
    <>
      <PageHeader
        title="Historial de respuestas"
        description="Registro inmutable de los cambios hechos desde tu cuenta o enlace de acción."
      />
      {history.length === 0 ? (
        <EmptyState message="Todavía no respondiste invitaciones" detail="Cuando respondas una, aparecerá aquí." />
      ) : (
        <Card title="Registro inmutable">
          <p className="-mt-2 mb-6 text-sm text-muted">Ordenado del más reciente al más antiguo.</p>
          <ol className="flex flex-col">
            {history.map((item, index) => (
              <li
                key={`${item.invitationId}-${item.changedAt}`}
                className="relative flex gap-5 pb-8 last:pb-0"
              >
                {index < history.length - 1 && (
                  <span aria-hidden="true" className="absolute top-4 left-[7px] h-full w-0.5 bg-line" />
                )}
                <span
                  aria-hidden="true"
                  className={cx(
                    'relative mt-1.5 size-4 shrink-0 rounded-full',
                    item.response === 'confirmada' ? 'bg-success' : 'bg-petrol',
                  )}
                />
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-ink">{historyLabel[item.response]}</p>
                  <p className="text-sm text-ink">{hospitalOf(item.invitationId)}</p>
                  <p className="text-sm text-muted">{formatDateTime(item.changedAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Alert tone="info" title="Alcance del registro">
        Una intención registrada no confirma asistencia ni donación. No se muestran datos de otras personas.
      </Alert>
    </>
  );
}
