import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { QueryView } from '../../../components/states/QueryView.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDate, formatDateTime } from '../../../lib/format.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { requestCode, requestStatusLabel, requestTypeLabel } from '../labels.js';
import type { CorrectionRequest } from '../types.js';

// DON-05 Mis solicitudes (Penpot «+»). Datos de listOwnCorrectionRequests.
// Al volver de «Nueva solicitud» muestra el código creado y lleva el foco al
// aviso; el estado de navegación se limpia para que no reaparezca al recargar.
export function RequestsPage() {
  const { scenario, listRequests } = useDonorDemo();
  const query = useDemoQuery(listRequests, scenario);
  const location = useLocation();
  const navigate = useNavigate();
  const [created] = useState(() => (location.state as { created?: string } | null)?.created);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!created) return;
    noticeRef.current?.focus();
    navigate(location.pathname, { replace: true, state: null });
    // Solo al montar: el aviso corresponde a la navegación que trajo aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Mis solicitudes"
        description="Consulta el estado de solicitudes de corrección o eliminación."
        actions={<LinkButton to="/donante/solicitudes/nueva">Nueva solicitud</LinkButton>}
      />
      <div aria-live="polite">
        {created && (
          <div ref={noticeRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
            <SuccessNotice
              announce={false}
              message={`Solicitud ${created} enviada`}
              detail="Quedó pendiente de revisión. Verás aquí cada cambio de estado."
            />
          </div>
        )}
      </div>
      <QueryView query={query} loadingMessage="Cargando tus solicitudes…" backTo="/donante/perfil" backLabel="Ir a mi perfil">
        {(requests) => <RequestList requests={requests} />}
      </QueryView>
      <Alert tone="info" title="Seguimiento transparente">
        Las solicitudes completadas, rechazadas o fallidas son terminales. Un nuevo cambio requiere una nueva solicitud.
      </Alert>
    </>
  );
}

function RequestList({ requests }: { requests: CorrectionRequest[] }) {
  return requests.length === 0 ? (
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
  );
}
