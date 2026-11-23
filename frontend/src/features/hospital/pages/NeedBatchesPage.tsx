import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { QueryView } from '../../../components/states/QueryView.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { formatDateTime } from '../../../lib/format.js';
import { useDemoMutation } from '../../../lib/useDemoMutation.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { fetchBatches, requestBatch } from '../api.js';
import { CoverageSection } from '../components/CoverageSection.js';
import { useHospital } from '../HospitalContext.js';
import { needCode } from '../labels.js';
import type { BatchRequestResult, InvitationBatch } from '../types.js';
import { TableScroll } from '../../../components/ui/TableScroll.js';

// HOS-05 Lotes de invitación. Datos de listOwnInvitationBatches; solicitar un lote usa requestInvitationBatch. El servidor elige a
// los donantes (grupo compatible, disponibles, dentro del radio y con cupo): esta pantalla nunca los ve ni los elige.
export function NeedBatchesPage() {
  const { needId = '' } = useParams();
  const { needs } = useHospital();
  const need = needs.find((item) => item.needId === needId);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => fetchBatches(needId), [needId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = useDemoQuery(load, needId);
  const save = useDemoMutation(requestBatch);
  const [result, setResult] = useState<BatchRequestResult | null>(null);
  const canRequest = need?.status === 'activa';

  async function request() {
    setResult(null);
    const saved = await save.run(needId);
    if (saved.ok) {
      setResult(saved.value);
      setVersion((current) => current + 1);
    }
  }

  return (
    <>
      <Link to={`/hospital/necesidades/${encodeURIComponent(needId)}`} className="self-start rounded font-semibold text-petrol underline underline-offset-4">
        Volver a la necesidad
      </Link>
      <PageHeader
        title="Lotes de invitación"
        description={need ? `Invitaciones enviadas para ${needCode(need.needId)}.` : 'Invitaciones enviadas a donantes.'}
        actions={<Button aria-disabled={save.pending || !canRequest} onClick={() => { if (canRequest && !save.pending) void request(); }}>Solicitar lote</Button>}
      />
      {!canRequest && need && (
        <Alert tone="info" title="Lotes no disponibles">Solo una necesidad activa admite nuevos lotes.</Alert>
      )}
      <div aria-live="polite" className="live-slot">
        {result && (
          <SuccessNotice
            message={result.createdInvitationCount === 0 ? 'No había donantes compatibles disponibles' : `Lote creado: ${result.createdInvitationCount} ${result.createdInvitationCount === 1 ? 'invitación' : 'invitaciones'}`}
            detail={result.createdInvitationCount === 0 ? 'No se envió ningún correo. Prueba más tarde o amplía el radio en otra necesidad.' : `${result.queuedEmailCount} correos en cola de envío.`}
          />
        )}
      </div>
      <SaveErrorNotice error={save.error} validationDetail="El servidor rechazó la solicitud del lote." onReview={() => { save.reset(); setVersion((current) => current + 1); }} />
      <QueryView query={query} loadingMessage="Cargando los lotes…" backTo="/hospital/necesidades" backLabel="Ir a necesidades">
        {(batches) => <BatchList batches={batches} />}
      </QueryView>
      {need?.status === 'activa' && <CoverageSection needId={needId} version={String(version)} />}
      <Alert tone="info" title="Cómo se eligen los donantes">
        El servidor elige a quienes tienen grupo compatible, están disponibles, dentro del radio y con cupo diario. La urgencia no cambia la selección.
      </Alert>
    </>
  );
}

function BatchList({ batches }: { batches: InvitationBatch[] }) {
  if (batches.length === 0) return <EmptyState message="Todavía no hay lotes" detail="Solicita un lote para invitar a donantes compatibles." />;
  return (
    <TableScroll label="Lotes de invitación">
      <table className="w-full min-w-[640px] text-left">
        <caption className="sr-only">Lotes de invitación</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="px-4 py-4 font-semibold">Creado</th>
            <th scope="col" className="px-4 py-4 font-semibold">Invitaciones</th>
            <th scope="col" className="px-4 py-4 font-semibold">Pendientes</th>
            <th scope="col" className="px-4 py-4 font-semibold">Enviadas</th>
            <th scope="col" className="px-4 py-4 font-semibold">Entregadas</th>
            <th scope="col" className="px-4 py-4 font-semibold">Fallidas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {batches.map((batch) => (
            <tr key={batch.batchId} className="text-ink">
              <th scope="row" className="px-4 py-4 font-semibold">{formatDateTime(batch.createdAt)}</th>
              <td className="px-4 py-4">{batch.createdInvitationCount}</td>
              <td className="px-4 py-4">{batch.deliveryCounts.pendiente}</td>
              <td className="px-4 py-4">{batch.deliveryCounts.enviada}</td>
              <td className="px-4 py-4">{batch.deliveryCounts.entregada}</td>
              <td className="px-4 py-4">{batch.deliveryCounts.fallida}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
