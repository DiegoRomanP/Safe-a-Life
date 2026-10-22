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
import { useSuperadminDemo, type GrantField } from '../SuperadminDemoContext.js';
import type { DonorValues } from '../types.js';

const backLink = (
  <Link to="/superadmin/solicitudes" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
    Volver a solicitudes
  </Link>
);

const fieldName: Record<GrantField, string> = { name: 'Nombre', email: 'Correo', declaredBloodType: 'Grupo declarado' };

// Una eliminación toca todos los datos de la persona. El contrato pide al menos
// un campo en allowedFields y no define cuál usar para una eliminación: punto
// abierto anotado en el plan.
const DELETION_FIELDS: GrantField[] = ['name', 'email', 'declaredBloodType'];

function show(values: DonorValues, field: GrantField): string {
  const value = values[field];
  if (!value) return '—';
  return field === 'declaredBloodType' ? bloodTypeLabel(value as NonNullable<DonorValues['declaredBloodType']>) : value;
}

/** Motivo obligatorio de 1 a 300 caracteres (grant, decisión y ejecución). */
function reasonError(value: string, empty: string): string | undefined {
  if (!value.trim()) return empty;
  return value.trim().length > 300 ? 'Usa como máximo 300 caracteres.' : undefined;
}

// SA-05 Resolver solicitud (Penpot «+»). getCorrectionRequest entrega solo
// metadatos.
// - Pendiente de corrección: los valores actual y propuesto se ven solo tras
//   motivo, step-up y grant de revisión de 10 minutos, y solo de los campos
//   pedidos. Decidir exige motivo (decideCorrectionRequest).
// - Aprobada: ejecutar exige motivo, step-up y grant de ejecución
//   (createContextualAccessGrant y executeApprovedCorrectionRequest).
// - Estados terminales: ya no se ofrece consultar datos.
// Sin backend (D-4).
export function RequestDetailPage() {
  const { requestId = '' } = useParams();
  const { requests, grantReview, donorDataFor, decideRequest, executeRequest } = useSuperadminDemo();
  const { requireStepUp, stepUpPanel } = useStepUpGate();
  const [accessReason, setAccessReason] = useState('');
  const [accessError, setAccessError] = useState<string>();
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionError, setDecisionError] = useState<string>();
  const [executeReason, setExecuteReason] = useState('');
  const [executeError, setExecuteError] = useState<string>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const accessRef = useRef<HTMLInputElement>(null);
  const decisionRef = useRef<HTMLInputElement>(null);
  const executeRef = useRef<HTMLInputElement>(null);
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
  const isPending = request.status === 'pendiente';
  const fields = request.requestedFields.filter((field): field is GrantField => field !== 'deletion');
  const donorData = isCorrection && isPending ? donorDataFor(request.requestId) : null;

  function handleAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = reasonError(accessReason, 'Indica el motivo de la consulta.');
    flushSync(() => setAccessError(found));
    if (found) return accessRef.current?.focus();
    const reason = accessReason.trim();
    requireStepUp('ver los datos de esta solicitud', () => {
      grantReview(request!.requestId, fields, reason);
      setAccessReason('');
      setNotice({ message: 'Acceso contextual concedido', detail: 'Solo a los campos pedidos. Vence en 10 minutos.' });
    });
  }

  function handleDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'aprobada' ? 'aprobada' : 'rechazada';
    const found = reasonError(decisionReason, 'Indica el motivo de la decisión.');
    flushSync(() => setDecisionError(found));
    if (found) return decisionRef.current?.focus();
    decideRequest(request!.requestId, decision, decisionReason.trim());
    setDecisionReason('');
    setNotice({
      message: decision === 'aprobada' ? `${code} aprobada` : `${code} rechazada`,
      detail: decision === 'aprobada' ? 'Ahora puede ejecutarse.' : 'La persona verá el estado en sus solicitudes.',
    });
  }

  function handleExecute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = reasonError(executeReason, 'Indica el motivo de la ejecución.');
    flushSync(() => setExecuteError(found));
    if (found) return executeRef.current?.focus();
    const reason = executeReason.trim();
    requireStepUp('ejecutar esta solicitud', () => {
      executeRequest(request!.requestId, isCorrection ? fields : DELETION_FIELDS, reason);
      setExecuteReason('');
      setNotice({ message: `${code} ejecutada`, detail: 'La solicitud quedó completada.' });
    });
  }

  let dataPanel;
  if (!isCorrection && isPending) {
    dataPanel = (
      <Alert tone="info" title="Eliminación de datos">
        Resolver una eliminación no requiere ver datos personales.
      </Alert>
    );
  } else if (!isPending) {
    dataPanel = (
      <Alert tone="info" title="Sin consulta de datos">
        Esta solicitud ya no requiere consultar datos personales.
      </Alert>
    );
  } else if (donorData) {
    dataPanel = (
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
    );
  } else {
    dataPanel = (
      <section aria-labelledby="acceso-titulo" className="flex flex-col gap-4 rounded-xl bg-petrol p-6 text-white">
        <h2 id="acceso-titulo" className="text-xl font-semibold">
          Acceso contextual protegido
        </h2>
        <p className="text-white/85">
          Para consultar los campos de esta solicitud indica el motivo y realiza step-up. El acceso dura como máximo 10
          minutos y queda auditado.
        </p>
        <form noValidate onSubmit={handleAccess} className="flex flex-col gap-3">
          <label htmlFor="acceso-motivo" className="text-sm font-semibold">
            Motivo de la consulta (obligatorio)
          </label>
          <input
            id="acceso-motivo"
            ref={accessRef}
            maxLength={300}
            value={accessReason}
            onChange={(event) => setAccessReason(event.target.value)}
            aria-invalid={accessError ? true : undefined}
            aria-describedby={accessError ? 'acceso-motivo-error' : undefined}
            className="min-h-11 w-full rounded-lg border border-white bg-surface px-3 text-ink focus-visible:outline-white"
          />
          {accessError && (
            <p id="acceso-motivo-error" className="rounded bg-surface px-2 py-1 text-sm text-danger">
              {accessError}
            </p>
          )}
          <div>
            <Button type="submit" variant="secondary" className="focus-visible:outline-white">
              Ver datos de la solicitud
            </Button>
          </div>
        </form>
      </section>
    );
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
        {dataPanel}
      </div>

      {isPending && (
        <Card title="Decisión">
          <form noValidate onSubmit={handleDecision} className="flex flex-col gap-4 sm:max-w-[560px]">
            <Field
              label="Motivo de la decisión"
              hint="Queda en la solicitud y en la auditoría. No incluyas datos personales."
              error={decisionError}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  ref={decisionRef}
                  maxLength={300}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                />
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
          <form noValidate onSubmit={handleExecute} className="flex flex-col gap-4 sm:max-w-[560px]">
            <Field
              label="Motivo de la ejecución"
              hint="Queda en la auditoría. No incluyas datos personales."
              error={executeError}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  ref={executeRef}
                  maxLength={300}
                  value={executeReason}
                  onChange={(event) => setExecuteReason(event.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit">Ejecutar solicitud</Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
