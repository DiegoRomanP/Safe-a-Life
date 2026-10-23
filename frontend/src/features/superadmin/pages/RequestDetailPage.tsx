import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, createMutationIntent } from '../../../api/client.js';
import { Button, buttonClass } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Alert } from '../../../components/ui/Alert.js';
import { ActionNotice, ErrorNotice, PageIntro, ReadBoundary, useAdminAction, useAdminRead } from '../components/AdminStates.js';
import { adminPath, idPath, privacyRequest } from '../httpGateway.js';
import { formatLima, requestFieldLabels, requestStatusLabels } from '../format.js';
import { createGrant, executeCorrection, grantFields, loadContextualData, type ContextualData, type ContextualGrant, type GrantField } from '../privacyGateway.js';
import type { PrivacyRequest } from '../types.js';

export function RequestDetailPage() {
  const { requestId } = useParams();
  return <RequestDetail key={requestId} requestId={requestId ?? ''} />;
}
function RequestDetail({ requestId }: { requestId: string }) {
  const path = adminPath + '/correction-requests/' + idPath(requestId);
  const read = useAdminRead(path, privacyRequest);
  const action = useAdminAction();
  const [decision, setDecision] = useState<'aprobada' | 'rechazada'>('aprobada');
  const [reason, setReason] = useState('');
  const request = read.data;
  const authorizationLost = action.error instanceof ApiError && (action.error.status === 401 || action.error.status === 403);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim()) void action.execute(path, 'PATCH', { decision, reason: reason.trim() }, read.retry);
  };
  return <>
    <PageIntro title="Detalle de solicitud" description="Revisa y resuelve una solicitud concreta con acceso limitado y auditado." />
    <ReadBoundary {...read}>
      {request && <>
        <Badge tone={request.status === 'pendiente' ? 'warning' : 'neutral'}>{requestStatusLabels[request.status]}</Badge>
        <Card title={'Solicitud ' + request.requestId}>
          <dl className="sa-metadata"><dt>Tipo</dt><dd>{request.type === 'correccion' ? 'Corrección' : 'Eliminación'}</dd><dt>Campos solicitados</dt><dd>{request.requestedFields.map((field) => requestFieldLabels[field]).join(', ')}</dd><dt>Creación</dt><dd>{formatLima(request.createdAt)}</dd><dt>Estado</dt><dd>{requestStatusLabels[request.status]}</dd></dl>
        </Card>
        <Alert tone="info" title="Alcance de la decisión"><p>Aprobar o rechazar guarda la decisión administrativa. La ejecución es una acción separada y requiere un acceso contextual específico.</p></Alert>
        {!authorizationLost && ['pendiente', 'aprobada', 'en_ejecucion'].includes(request.status) && <ContextualAccess key={request.requestId + request.status} request={request} onExecuted={read.retry} />}
        {request.type === 'eliminacion' && <Alert tone="warning" title="Integración de eliminación pendiente">El backend local no dispone del adaptador de eliminación de cuentas. Aprobar esta solicitud no elimina a la persona y no se ofrece una ejecución simulada.</Alert>}
        <Card title="Decisión administrativa">
          <form className="sa-form" onSubmit={submit}>
            <label htmlFor="sa-request-decision">Decisión</label>
            <Select id="sa-request-decision" value={decision} disabled={action.pending || request.status !== 'pendiente'} onChange={(event) => setDecision(event.target.value as 'aprobada' | 'rechazada')} options={[{ value: 'aprobada', label: 'Aprobar' }, { value: 'rechazada', label: 'Rechazar' }]} />
            <label htmlFor="sa-request-reason">Motivo administrativo *</label>
            <Input id="sa-request-reason" required minLength={1} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} disabled={action.pending || request.status !== 'pendiente'} />
            <p className="text-sm text-muted">No incluyas datos personales en el motivo.</p>
            <Button type="submit" disabled={action.pending || request.status !== 'pendiente'}>{action.pending ? 'Guardando…' : 'Guardar decisión'}</Button>
            <ActionNotice {...action} />
          </form>
        </Card>
      </>}
    </ReadBoundary>
    <Link className={buttonClass('secondary')} to="/superadmin/solicitudes">Volver a solicitudes</Link>
  </>;
}

function ContextualAccess({ request, onExecuted }: { request: PrivacyRequest; onExecuted: () => void }) {
  const fields = request.type === 'eliminacion' ? [...grantFields] : request.requestedFields.filter((field): field is GrantField => field !== 'deletion');
  const [selected, setSelected] = useState<GrantField[]>([]);
  const [purpose, setPurpose] = useState<'review' | 'execute'>('review');
  const [reason, setReason] = useState('');
  const [access, setAccess] = useState<{ grant: ContextualGrant; values?: ContextualData } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const grantIntent = useRef(createMutationIntent());
  const executionIntent = useRef(createMutationIntent());
  const mayExecute = request.type === 'correccion' && request.status === 'aprobada';

  const clear = () => {
    generation.current++;
    controller.current?.abort();
    setAccess(null); setConfirmed(false); setPending(false); busy.current = false;
  };
  useEffect(() => () => {
    generation.current++;
    controller.current?.abort();
    grantIntent.current.reset(); executionIntent.current.reset();
  }, []);
  useEffect(() => {
    if (!access) return;
    const timeout = window.setTimeout(() => {
      generation.current++; controller.current?.abort();
      setAccess(null); setConfirmed(false); setPending(false); busy.current = false;
      setNotice('El acceso contextual venció. Los valores personales se han ocultado.');
    }, Math.max(0, Date.parse(access.grant.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [access]);

  const authorize = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    const allowedFields = purpose === 'execute' ? fields : selected;
    if (!reason.trim() || !allowedFields.length) { setNotice('Selecciona al menos un campo e indica un motivo sin datos personales.'); return; }
    clear();
    const current = generation.current;
    const signal = new AbortController(); controller.current = signal;
    busy.current = true; setPending(true); setError(null); setNotice('');
    const input = { requestId: request.requestId, action: purpose, allowedFields, reason: reason.trim() };
    try {
      const grant = await createGrant(input, grantIntent.current.keyFor(adminPath + '/access-grants', input), signal.signal);
      if (current !== generation.current || signal.signal.aborted) return;
      grantIntent.current.reset();
      setAccess({ grant });
      if (purpose === 'review') {
        const values = await loadContextualData(request.requestId, grant, signal.signal);
        if (current !== generation.current || signal.signal.aborted) return;
        setAccess({ grant, values });
      }
      setNotice(purpose === 'review' ? 'Acceso de revisión concedido únicamente a los campos seleccionados.' : 'Ejecución autorizada temporalmente. Revisa la confirmación antes de ejecutarla.');
    } catch (failure) {
      if (current !== generation.current || signal.signal.aborted) return;
      clear(); setError(failure);
    } finally {
      if (current === generation.current) { busy.current = false; setPending(false); }
    }
  };
  const execute = async () => {
    if (busy.current || !confirmed || !mayExecute || access?.grant.action !== 'execute') return;
    const grant = access.grant;
    const current = generation.current;
    const signal = new AbortController(); controller.current = signal;
    busy.current = true; setPending(true); setError(null);
    const path = adminPath + '/correction-requests/' + idPath(request.requestId) + '/executions';
    try {
      const result = await executeCorrection(request.requestId, grant, executionIntent.current.keyFor(path, { grantId: grant.grantId }), signal.signal);
      if (current !== generation.current || signal.signal.aborted) return;
      executionIntent.current.reset(); clear();
      setNotice(result.status === 'en_ejecucion' ? 'La solicitud sigue en ejecución; el cambio de correo requiere verificación adicional.' : 'El servidor confirmó el estado: ' + requestStatusLabels[result.status] + '.');
      onExecuted();
    } catch (failure) {
      if (current !== generation.current || signal.signal.aborted) return;
      clear(); setError(failure);
      if (failure instanceof ApiError && (failure.status === 0 || failure.code === 'INVALID_RESPONSE')) setNotice('El resultado no pudo confirmarse. Actualiza el estado antes de intentar otra ejecución.');
    } finally {
      if (current === generation.current) { busy.current = false; setPending(false); }
    }
  };

  return <Card title="Acceso contextual protegido">
    <p className="mb-4 text-sm text-muted">El servidor limita cada acceso a esta solicitud, usuario, acción y campos durante un máximo de 10 minutos. Los valores solo permanecen en esta pantalla mientras el acceso está vigente.</p>
    <form className="sa-form" onSubmit={(event) => { void authorize(event); }}>
      <label htmlFor="sa-access-purpose">Acción autorizada</label>
      <Select id="sa-access-purpose" value={purpose} disabled={pending} onChange={(event) => { clear(); setPurpose(event.target.value as 'review' | 'execute'); }} options={[{ value: 'review', label: 'Revisar campos seleccionados' }, ...(mayExecute ? [{ value: 'execute', label: 'Ejecutar corrección aprobada' }] : [])]} />
      {purpose === 'review' ? <fieldset className="grid gap-3"><legend className="mb-2 font-semibold">Campos necesarios para la revisión</legend>{fields.map((field) => <label key={field} htmlFor={'sa-field-' + field} className="flex items-center gap-3"><input id={'sa-field-' + field} type="checkbox" checked={selected.includes(field)} disabled={pending} onChange={(event) => { clear(); setSelected(event.target.checked ? [...selected, field] : selected.filter((entry) => entry !== field)); }} />{requestFieldLabels[field]}</label>)}</fieldset> : <p className="text-sm">Campos que se ejecutarán: {fields.map((field) => requestFieldLabels[field]).join(', ')}.</p>}
      <label htmlFor="sa-access-reason">Motivo del acceso *</label>
      <Input id="sa-access-reason" required maxLength={300} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} />
      <p className="text-sm text-muted">Describe el objetivo administrativo sin incluir valores personales.</p>
      <Button id="sa-access-submit" type="submit" disabled={pending}>{pending ? 'Procesando acceso…' : purpose === 'review' ? 'Consultar campos autorizados' : 'Autorizar ejecución'}</Button>
    </form>
    <div className="mt-4" aria-live="polite">{notice && <p role="status">{notice}</p>}</div>
    <ErrorNotice error={error} />
    {access?.values && <div className="mt-5 grid gap-4 sm:grid-cols-2">{(['currentValues', 'proposedValues'] as const).map((kind) => <section key={kind} className="rounded-lg border border-line p-4"><h3 className="mb-3 font-semibold">{kind === 'currentValues' ? 'Valores actuales autorizados' : 'Valores propuestos autorizados'}</h3><dl className="grid gap-2">{Object.entries(access.values![kind]).map(([field, value]) => <div key={field}><dt className="text-sm text-muted">{requestFieldLabels[field as GrantField]}</dt><dd className="break-words">{value}</dd></div>)}</dl></section>)}</div>}
    {access && <div className="mt-4 flex flex-col items-start gap-3"><p className="text-sm text-muted">Acceso válido hasta {formatLima(access.grant.expiresAt)}.</p><Button variant="ghost" disabled={pending} onClick={() => { clear(); setNotice('Acceso cerrado. Los valores personales se han ocultado.'); }}>Cerrar acceso contextual</Button></div>}
    {access?.grant.action === 'execute' && mayExecute && <div className="mt-5 grid gap-3 rounded-lg border border-line p-4"><label className="flex items-center gap-3" htmlFor="sa-execution-confirm"><input id="sa-execution-confirm" type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo ejecutar los campos aprobados de esta solicitud.</label><Button variant="danger" disabled={pending || !confirmed} onClick={() => { void execute(); }}>Ejecutar corrección aprobada</Button></div>}
  </Card>;
}
