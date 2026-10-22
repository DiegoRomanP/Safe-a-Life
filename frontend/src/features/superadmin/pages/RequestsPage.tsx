import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Badge } from '../../../components/ui/Badge.js';
import { formatDateTime } from '../../../lib/format.js';
import { requestCode, requestStatusLabel, requestTitle } from '../labels.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';

// SA-05 Solicitudes de corrección o eliminación (listCorrectionRequests). Solo
// metadatos: tipo, campos pedidos, estado y fechas; nunca valores personales.
export function AdminRequestsPage() {
  const { requests } = useSuperadminDemo();

  return (
    <>
      <PageHeader title="Solicitudes" description="Revisa solicitudes de corrección o eliminación de datos de donantes." />
      {requests.length === 0 ? (
        <EmptyState message="No hay solicitudes" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left">
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
              {requests.map((request) => {
                const status = requestStatusLabel[request.status];
                return (
                  <tr key={request.requestId} className="text-ink">
                    <th scope="row" className="px-4 py-4 font-semibold">
                      <Link
                        to={`/superadmin/solicitudes/${request.requestId}`}
                        className="rounded text-petrol underline underline-offset-4"
                      >
                        {requestCode(request.requestId)}
                      </Link>
                    </th>
                    <td className="px-4 py-4">{requestTitle(request)}</td>
                    <td className="px-4 py-4">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-4">{formatDateTime(request.createdAt)}</td>
                    <td className="px-4 py-4">{formatDateTime(request.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
