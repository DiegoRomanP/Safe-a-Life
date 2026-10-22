import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { ResultNotice, type Notice } from '../components/ResultNotice.js';
import { useStepUpGate } from '../components/StepUpPanel.js';
import { requestCode, requestStatusLabel, requestTitle } from '../labels.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';
import type { DonorValues } from '../types.js';

const backLink = (
  <Link to="/superadmin/solicitudes" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
    Volver a solicitudes
  </Link>
);

const fieldName: Record<keyof DonorValues, string> = { name: 'Nombre', email: 'Correo', declaredBloodType: 'Grupo declarado' };

function show(values: DonorValues, field: keyof DonorValues): string {
  const value = values[field];
  if (!value) return '—';
  return field === 'declaredBloodType' ? bloodTypeLabel(value as NonNullable<DonorValues['declaredBloodType']>) : value;
}

// SA-05 Resolver solicitud (Penpot «+»). getCorrectionRequest entrega solo
// metadatos. Los valores actual y propuesto (getContextualDonorData) se ven
// solo tras step-up y grant contextual de 10 minutos
// (createContextualAccessGrant), y solo de los campos pedidos. Decidir exige
// motivo (decideCorrectionRequest); ejecutar exige solicitud aprobada y step-up
// (executeApprovedCorrectionRequest). Sin backend (D-4).
export function RequestDetailPage() {
  const { requestId = '' } = useParams();
  const { requests, grantAccess, donorDataFor, decideRequest, executeRequest } = useSuperadminDemo();
  const { requireStepUp, stepUpPanel } = useStepUpGate();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const request = requests.find((item) => item.requestId === requestId);

  if (!request) {
    return (
      <>
        {backLink}
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-3xl font-bold text-ink">No pudimos abrir esta solicitud</h1>
          <p className="text-muted">Puede que no exista o que ya no esté disponible.</p>
        </section>
      </>
    );
  }

  const code = requestCode(request.requestId);
  const status = requestStatusLabel[request.status];
  const isCorrection = request.type === 'correccion';
  const donorData = isCorrection ? donorDataFor(request.requestId) : null;
  const fields = request.requestedFields.filter((field): field is keyof DonorValues => field !== 'deletion');

  function handleDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'aprobada' ? 'aprobada' : 'rechazada';
    const found = !reason.trim() ? 'Indica el motivo de la decisión.' : reason.trim().length > 300 ? 'Usa como máximo 300 caracteres.' : undefined;
    flushSync(() => setReasonError(found));
    if (found) return reasonRef.current?.focus();
    decideRequest(request!.requestId, decision, reason.trim());
    setReason('');
    setNotice({
      message: decision === 'aprobada' ? `${code} aprobada` : `${code} rechazada`,
      detail: decision === 'aprobada' ? 'Ahora puede ejecutarse.' : 'La persona verá el estado en sus solicitudes.',
    });
  }

  return (
    <>
      {backLink}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">{`Solicitud ${code}`}</h1>
        <p className="text-muted">{`${requestTitle(request)} · creada ${formatDateTime(request.createdAt)}`}</p>
        <Badge tone={status.tone} className="self-start">
          {status.label}
        </Badge>
      </div>
      {stepUpPanel}
      <ResultNotice notice={notice} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Datos de la solicitud">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="text-sm font-semibold text-muted">Acción</dt>
            <dd className="text-ink">{requestTitle(request)}</dd>
            <dt className="text-sm font-semibold text-muted">Estado</dt>
            <dd className="text-ink">{status.label}</dd>
            <dt className="text-sm font-semibold text-muted">Última actualización</dt>
            <dd className="text-ink">{formatDateTime(request.updatedAt)}</dd>
            {request.decisionReason && (
              <>
                <dt className="text-sm font-semibold text-muted">Motivo de la decisión</dt>
                <dd className="text-ink">{request.decisionReason}</dd>
              </>
            )}
          </dl>
          <p className="mt-4 text-sm text-muted">La auditoría no conservará los valores anteriores ni nuevos.</p>
        </Card>

        {isCorrection ? (
          donorData ? (
            <Card title="Valores de la solicitud">
              <p className="-mt-2 mb-4 text-sm text-muted">Acceso contextual de 10 minutos, solo a los campos pedidos.</p>
              <table className="w-full text-left">
                <caption className="sr-only">{`Valores actual y propuesto de ${code}`}</caption>
                <thead>
                  <tr className="border-b border-line text-sm text-muted">
                    <th scope="col" className="py-2 font-semibold">Campo</th>
                    <th scope="col" className="py-2 font-semibold">Actual</th>
                    <th scope="col" className="py-2 font-semibold">Propuesto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {fields.map((field) => (
                    <tr key={field} className="text-ink">
                      <th scope="row" className="py-3 font-semibold">{fieldName[field]}</th>
                      <td className="py-3">{show(donorData.currentValues, field)}</td>
                      <td className="py-3">{show(donorData.proposedValues, field)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <section aria-labelledby="acceso-titulo" className="flex flex-col gap-4 rounded-xl bg-petrol p-6 text-white">
              <h2 id="acceso-titulo" className="text-xl font-semibold">
                Acceso contextual protegido
              </h2>
              <p className="text-white/85">
                Para consultar los campos de esta solicitud, realiza step-up. El acceso dura como máximo 10 minutos y
                queda auditado.
              </p>
              <div>
                <Button
                  variant="secondary"
                  className="focus-visible:outline-white"
                  onClick={() =>
                    requireStepUp('ver los datos de esta solicitud', () => {
                      grantAccess(request.requestId);
                      setNotice({ message: 'Acceso contextual concedido', detail: 'Vence en 10 minutos.' });
                    })
                  }
                >
                  Ver datos de la solicitud
                </Button>
              </div>
            </section>
          )
        ) : (
          <Alert tone="info" title="Eliminación de datos">
            Resolver una eliminación no requiere ver datos personales.
          </Alert>
        )}
      </div>

      {request.status === 'pendiente' && (
        <Card title="Decisión">
          <form noValidate onSubmit={handleDecision} className="flex flex-col gap-4 sm:max-w-[560px]">
            <Field label="Motivo" hint="Queda en la solicitud y en la auditoría. No incluyas datos personales." error={reasonError} required>
              {(control) => (
                <Input {...control} ref={reasonRef} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
              )}
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="decision" value="aprobada">
                Aprobar
              </Button>
              <Button type="submit" name="decision" value="rechazada" variant="danger">
                Rechazar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {request.status === 'aprobada' && (
        <Card title="Ejecución">
          <p className="mb-4 text-muted">La solicitud está aprobada. Ejecutarla aplica el cambio y no se puede deshacer.</p>
          <Button
            onClick={() =>
              requireStepUp('ejecutar esta solicitud', () => {
                executeRequest(request.requestId);
                setNotice({ message: `${code} ejecutada`, detail: 'La solicitud quedó completada.' });
              })
            }
          >
            Ejecutar solicitud
          </Button>
        </Card>
      )}
    </>
  );
}
