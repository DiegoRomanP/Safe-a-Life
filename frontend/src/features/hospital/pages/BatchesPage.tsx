import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';
import { needCode } from '../labels.js';

// HOS-04 Lotes y entregas (Penpot «+»). Datos de listOwnInvitationBatches; el
// hospital solicita un lote (requestInvitationBatch) pero no elige donantes, y
// solo con la necesidad activa. Ni la urgencia ni el tiempo crean lotes
// automáticos. El estado por invitación se ve en HOS-05 (Respuestas).
export function BatchesPage() {
  const { needId = '' } = useParams();
  const { needs, batchesOf, requestBatch } = useHospitalDemo();
  const [result, setResult] = useState<{ created: number; queued: number } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const need = needs.find((item) => item.needId === needId);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  if (!need) {
    return (
      <>
        <Link to="/hospital/necesidades" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
          Volver a necesidades
        </Link>
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-3xl font-bold text-ink">No pudimos abrir estos lotes</h1>
          <p className="text-muted">Puede que la necesidad no exista o que no pertenezca a tu hospital.</p>
        </section>
      </>
    );
  }

  const code = needCode(need.needId);
  const batches = batchesOf(need.needId);
  const canRequest = need.status === 'activa';

  function handleRequest() {
    const { createdInvitationCount, queuedEmailCount } = requestBatch(need!.needId);
    setResult({ created: createdInvitationCount, queued: queuedEmailCount });
  }

  return (
    <>
      <Link
        to={`/hospital/necesidades/${need.needId}`}
        className="self-start rounded font-semibold text-petrol underline underline-offset-4"
      >
        Volver a la necesidad
      </Link>
      <PageHeader
        title={`Lotes y entregas · ${code}`}
        description="Los lotes posteriores siempre requieren una acción manual."
        actions={canRequest ? <Button onClick={handleRequest}>Solicitar nuevo lote</Button> : undefined}
      />
      <Alert tone="info" title="Sin automatismos por urgencia">
        La urgencia, el tiempo transcurrido o perder una confirmación no generan otro lote. El sistema aplica la
        preselección académica; el hospital no elige donantes.
      </Alert>
      {!canRequest && (
        <Alert tone="warning" title="Solo con la necesidad activa">
          Para solicitar un lote, la necesidad debe estar activa.
        </Alert>
      )}
      <div aria-live="polite">
        {result && (
          <div ref={resultRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
            <SuccessNotice
              announce={false}
              message={
                result.created === 0
                  ? 'Lote solicitado: no hubo invitaciones nuevas'
                  : `Lote solicitado: ${result.created} ${result.created === 1 ? 'invitación nueva' : 'invitaciones nuevas'}`
              }
              detail={
                result.created === 0
                  ? 'No hay más posibles donantes que cumplan la preselección en el radio.'
                  : `${result.queued} ${result.queued === 1 ? 'correo quedó' : 'correos quedaron'} en cola de envío.`
              }
            />
          </div>
        )}
      </div>

      <section aria-labelledby="historial-lotes" className="flex flex-col gap-4">
        <h2 id="historial-lotes" className="text-xl font-semibold text-ink">
          Historial de lotes
        </h2>
        {batches.length === 0 ? (
          <EmptyState message="Todavía no hay lotes para esta necesidad" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">{`Lotes de ${code}`}</caption>
              <thead>
                <tr className="border-b border-line text-sm text-muted">
                  <th scope="col" className="px-4 py-4 font-semibold">Lote</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Creado</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Invitaciones</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Pendientes</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Enviadas</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Entregadas</th>
                  <th scope="col" className="px-4 py-4 font-semibold">Fallidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batches.map((batch, index) => (
                  <tr key={batch.batchId} className="text-ink">
                    <th scope="row" className="px-4 py-4 font-semibold">{`LOT-${String(index + 1).padStart(3, '0')}`}</th>
                    <td className="px-4 py-4">{formatDateTime(batch.createdAt)}</td>
                    <td className="px-4 py-4">{batch.createdInvitationCount}</td>
                    <td className="px-4 py-4">{batch.deliveryCounts.pendiente}</td>
                    <td className="px-4 py-4">{batch.deliveryCounts.enviada}</td>
                    <td className="px-4 py-4">{batch.deliveryCounts.entregada}</td>
                    <td className="px-4 py-4">{batch.deliveryCounts.fallida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div>
        <LinkButton to={`/hospital/necesidades/${need.needId}/respuestas`} variant="secondary">
          Ver estado de cada invitación
        </LinkButton>
      </div>
    </>
  );
}
