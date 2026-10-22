import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { formatDate, formatDateTime } from '../../../lib/format.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { requestCode, requestStatusLabel, requestTypeLabel } from '../labels.js';

// DON-05 Mis solicitudes (Penpot «+»). Datos de listOwnCorrectionRequests.
// Crear una solicitud (createOwnCorrectionRequest) queda para un slice
// posterior, por eso no se muestra «Nueva solicitud».
export function RequestsPage() {
  const { requests } = useDonorDemo();

  return (
    <>
      <PageHeader
        title="Mis solicitudes"
        description="Consulta el estado de solicitudes de corrección o eliminación."
      />
      {requests.length === 0 ? (
        <EmptyState
          message="No tienes solicitudes"
          detail="Cuando pidas corregir o eliminar tus datos, verás aquí su estado."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <caption className="sr-only">Solicitudes de corrección o eliminación</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-4 py-4 font-semibold">Solicitud</th>
                <th scope="col" className="px-4 py-4 font-semibold">Tipo</th>
                <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-4 font-semibold">Creada</th>
                <th scope="col" className="px-4 py-4 font-semibold">Última actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((request) => (
                <tr key={request.requestId} className="text-ink">
                  <th scope="row" className="px-4 py-4 font-semibold">
                    {requestCode(request.requestId)}
                  </th>
                  <td className="px-4 py-4">{requestTypeLabel(request)}</td>
                  <td className="px-4 py-4">{requestStatusLabel[request.status]}</td>
                  <td className="px-4 py-4">{formatDate(request.createdAt)}</td>
                  <td className="px-4 py-4">{formatDateTime(request.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Alert tone="info" title="Seguimiento transparente">
        Las solicitudes completadas, rechazadas o fallidas son terminales. Un nuevo cambio requiere una nueva solicitud.
      </Alert>
    </>
  );
}
