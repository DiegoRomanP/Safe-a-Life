import { useEffect, useRef, useState } from 'react';
import { Plus, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  api,
  type CreateNeedInput,
  type InvitationBatchRecord,
  type Need,
  type NeedResponse,
} from '../api/client.js';
import { ErrorState, LoadingState, Notice, PageHeading, StatusBadge } from '../components/Ui.js';

function statusTone(status: Need['status']) {
  if (status === 'activa') return 'info' as const;
  if (status === 'meta_alcanzada') return 'success' as const;
  if (status === 'cancelada' || status === 'vencida') return 'danger' as const;
  if (status === 'borrador') return 'warning' as const;
  return 'neutral' as const;
}

function bloodTypeLabel(value: string): string {
  return value.replace('_NEG', '−').replace('_POS', '+');
}

function statusLabel(status: Need['status']): string {
  return status.replaceAll('_', ' ');
}

export function HospitalOverviewPage() {
  const [needs, setNeeds] = useState<Need[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api.getHospitalNeeds().then((result) => {
      if (current) setNeeds(result);
    }).catch(() => {
      if (current) setError('No se pudo cargar el resumen de esta institución.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  const activeNeeds = needs?.filter((need) => need.status === 'activa') ?? [];
  const confirmedIntents = activeNeeds.reduce((sum, need) => sum + need.confirmedIntentCount, 0);
  const targetIntents = activeNeeds.reduce((sum, need) => sum + need.targetConfirmations, 0);

  return (
    <>
      <PageHeading
        title="Resumen hospitalario"
        description="Una vista rápida de las necesidades y respuestas de tu institución."
        action={<Link className="button button--primary button--small" to="/app/hospital/needs">Ver necesidades</Link>}
      />
      <Notice tone="warning" title="Las cifras expresan intenciones de asistir">
        No representan unidades de sangre, donaciones realizadas ni suficiencia clínica.
      </Notice>
      {loading && <LoadingState label="Cargando resumen del hospital" />}
      {!loading && error && <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !error && needs && (
        <>
          <div className="metric-strip" aria-label="Indicadores de necesidades activas">
            <div className="metric-card"><span>Necesidades activas</span><strong>{activeNeeds.length}</strong></div>
            <div className="metric-card"><span>Intenciones confirmadas</span><strong>{confirmedIntents}</strong></div>
            <div className="metric-card"><span>Meta de intenciones</span><strong>{targetIntents}</strong></div>
          </div>
          <section className="overview-list" aria-labelledby="overview-needs-title">
            <div className="section-heading"><div><h2 id="overview-needs-title">Actividad reciente</h2><p>Necesidades de la institución autenticada.</p></div><Link className="text-link" to="/app/hospital/responses">Ver respuestas</Link></div>
            {needs.length === 0 ? <div className="empty-state"><h3>Aún no hay necesidades</h3><p>Crea una necesidad para iniciar el recorrido local.</p></div> : (
              <ul className="need-list">
                {needs.slice(0, 3).map((need) => (
                  <li className="overview-need-row" key={need.needId}>
                    <div><strong>{bloodTypeLabel(need.requiredBloodType)} · {need.urgency}</strong><span>{need.confirmedIntentCount} de {need.targetConfirmations} intenciones confirmadas</span></div>
                    <StatusBadge tone={statusTone(need.status)}>{statusLabel(need.status)}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function HospitalNeedsPage() {
  const [needs, setNeeds] = useState<Need[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [reload, setReload] = useState(0);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    api.getHospitalNeeds().then((result) => {
      if (current) setNeeds(result);
    }).catch(() => {
      if (current) setLoadError('No se pudieron cargar las necesidades de esta institución.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    if (announcement) announcementRef.current?.focus();
  }, [announcement]);

  function addNeed(need: Need) {
    setNeeds((previous) => [need, ...(previous ?? [])]);
    setShowCreateForm(false);
    setAnnouncement('Borrador de necesidad guardado. No se envió ninguna invitación.');
  }

  const siteId = needs?.[0]?.siteId;
  return (
    <>
      <PageHeading
        title="Necesidades"
        description="Publica y revisa las necesidades de tu institución."
        action={(
          <div className="page-actions">
            <button className="button button--secondary button--small" onClick={() => setReload((value) => value + 1)}>
              <RotateCw size={15} aria-hidden="true" /> Actualizar
            </button>
            <button className="button button--primary button--small" disabled={!siteId} onClick={() => setShowCreateForm((value) => !value)}>
              <Plus size={16} aria-hidden="true" /> Crear necesidad
            </button>
          </div>
        )}
      />
      {announcement && <p ref={announcementRef} className="action-announcement" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{announcement}</p>}
      <Notice tone="warning" title="La meta cuenta intenciones, no unidades">
        El grupo declarado y la distancia solo apoyan una preselección académica. El personal clínico verifica grupo y elegibilidad.
      </Notice>
      {showCreateForm && siteId && <CreateNeedForm siteId={siteId} onCreated={addNeed} onCancel={() => setShowCreateForm(false)} />}
      {loading && <LoadingState label="Cargando necesidades del hospital" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !loadError && needs?.length === 0 && (
        <div className="empty-state"><h2>Aún no hay necesidades</h2><p>Crea una necesidad para iniciar un recorrido sintético.</p></div>
      )}
      {!loading && !loadError && Boolean(needs?.length) && (
        <ul className="need-list">
          {needs?.map((need) => (
            <li className="need-item" key={need.needId}>
              <div className="need-item__heading">
                <div><span className="need-item__eyebrow">Glóbulos rojos · {bloodTypeLabel(need.requiredBloodType)}</span><h2>{need.urgency} · {need.targetConfirmations} intenciones</h2></div>
                <StatusBadge tone={statusTone(need.status)}>{statusLabel(need.status)}</StatusBadge>
              </div>
              <div className="need-metrics">
                <div><span>Intenciones confirmadas</span><strong>{need.confirmedIntentCount} <small>de {need.targetConfirmations}</small></strong></div>
                <div><span>Radio elegido</span><strong>{need.radiusKm} <small>km</small></strong></div>
                <div><span>Vencimiento</span><strong>{new Date(need.expiresAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
              </div>
              <div className="progress-track" role="progressbar" aria-label="Intenciones confirmadas" aria-valuemin={0} aria-valuemax={need.targetConfirmations} aria-valuenow={need.confirmedIntentCount}>
                <span style={{ width: `${Math.min(100, (need.confirmedIntentCount / need.targetConfirmations) * 100)}%` }} />
              </div>
              <p className="need-item__footnote">Las confirmaciones expresan intenciones de asistir; no representan unidades ni donaciones realizadas.</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function HospitalBatchesPage() {
  const [needs, setNeeds] = useState<Need[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    api.getHospitalNeeds().then((result) => {
      if (current) setNeeds(result);
    }).catch(() => {
      if (current) setLoadError('No se pudieron cargar los lotes de esta institución.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  return (
    <>
      <PageHeading title="Lotes de invitación" description="Registro de solicitudes manuales para necesidades de tu institución." />
      <Notice tone="warning" title="Límite del mock">
        Solicitar un lote no ejecuta matching, no selecciona donantes y no envía correos; esta demostración registra cero invitaciones.
      </Notice>
      {loading && <LoadingState label="Cargando lotes del hospital" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !loadError && needs?.length === 0 && <div className="empty-state"><h2>Sin necesidades para gestionar lotes</h2><p>Crea una necesidad antes de registrar una solicitud manual.</p></div>}
      {!loading && !loadError && needs?.map((need) => <HospitalBatchGroup key={need.needId} need={need} />)}
    </>
  );
}

const BATCH_PAGE_LIMIT = 20;

function mergeBatchRecords(previous: InvitationBatchRecord[], incoming: InvitationBatchRecord[]) {
  return [...new Map([...previous, ...incoming].map((batch) => [batch.batchId, batch])).values()];
}

function HospitalBatchGroup({ need }: { need: Need }) {
  const [batches, setBatches] = useState<InvitationBatchRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState<{ cursor?: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState<Awaited<ReturnType<typeof api.requestHospitalInvitationBatch>> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [listAnnouncement, setListAnnouncement] = useState('');
  const [focusRevision, setFocusRevision] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const actionErrorRef = useRef<HTMLParagraphElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const prepareFocus = useRef(false);
  const mounted = useRef(false);
  const readRevision = useRef(0);
  const readingRef = useRef(false);
  const mutationLocked = useRef(false);

  // Each keyed group owns its cursors. A refresh supersedes an older page;
  // unmount/need replacement invalidates both read and mutation continuations.
  useEffect(() => {
    mounted.current = true;
    void readBatches();
    return () => { mounted.current = false; readRevision.current++; };
  }, [need.needId]);

  useEffect(() => {
    if (focusRevision) statusRef.current?.focus();
  }, [focusRevision]);
  useEffect(() => { if (actionError) actionErrorRef.current?.focus(); }, [actionError]);
  useEffect(() => {
    if (!registered && prepareFocus.current) {
      prepareFocus.current = false;
      requestButtonRef.current?.focus();
    }
  }, [registered]);

  async function readBatches(cursor?: string, announce = false) {
    const revision = ++readRevision.current;
    readingRef.current = true;
    setReading(true);
    setReadError(null);
    setListAnnouncement('');
    if (cursor === undefined) { setBatches([]); setNextCursor(null); }
    try {
      const page = await api.getHospitalInvitationBatches(need.needId, {
        limit: BATCH_PAGE_LIMIT, ...(cursor === undefined ? {} : { cursor }),
      });
      if (!mounted.current || revision !== readRevision.current) return;
      setBatches((previous) => mergeBatchRecords(cursor === undefined ? [] : previous, page.items));
      setNextCursor(page.pagination.nextCursor);
      if (announce) {
        setListAnnouncement('Listado actualizado.');
        setFocusRevision((value) => value + 1);
      }
    } catch {
      if (!mounted.current || revision !== readRevision.current) return;
      setReadError({ ...(cursor === undefined ? {} : { cursor }), message: cursor === undefined
        ? 'El listado no se pudo actualizar. Reintenta la lectura; no se solicitará otro lote.'
        : 'No se pudo cargar la siguiente página. Reintenta la lectura; no se solicitará otro lote.' });
      setFocusRevision((value) => value + 1);
    } finally {
      if (mounted.current && revision === readRevision.current) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  async function requestBatch() {
    if (mutationLocked.current || readingRef.current || need.status !== 'activa') return;
    mutationLocked.current = true;
    setSaving(true);
    setActionError(null);
    setListAnnouncement('');
    try {
      const result = await api.requestHospitalInvitationBatch(need.needId);
      if (!mounted.current) return;
      // POST success is authoritative even if the independent GET fails.
      setRegistered(result);
      setFocusRevision((value) => value + 1);
    } catch {
      if (!mounted.current) return;
      mutationLocked.current = false;
      setActionError('No se pudo confirmar el registro del lote. Comprueba que la necesidad siga activa. Si reintentas, se conservará la misma solicitud ante un resultado incierto.');
      setSaving(false);
      return;
    }
    if (!mounted.current) return;
    setSaving(false);
    await readBatches(undefined, true);
  }

  const announcement = registered
    ? `Solicitud de lote registrada. Invitaciones creadas: ${registered.createdInvitationCount}; correos en cola: ${registered.queuedEmailCount}.${readError ? ` ${readError.message}` : listAnnouncement ? ` ${listAnnouncement} ${batches.length} solicitudes de lote mostradas.` : ''}`
    : readError?.message ?? (listAnnouncement ? `${listAnnouncement} ${batches.length} solicitudes de lote mostradas.` : '');
  const listId = `batch-list-${need.needId}`;

  return (
    <section className="panel batch-group" aria-labelledby={`batch-title-${need.needId}`}>
      <div className="panel-heading"><div>
        <h2 id={`batch-title-${need.needId}`}>{bloodTypeLabel(need.requiredBloodType)} · {need.urgency}</h2>
        <p>Meta de {need.targetConfirmations} intenciones · {statusLabel(need.status)}</p>
      </div></div>
      <div className="page-actions">
        <button ref={requestButtonRef} className="button button--secondary"
          disabled={need.status !== 'activa' || saving || reading || Boolean(registered)} onClick={() => void requestBatch()}>
          {saving ? 'Registrando…' : 'Solicitar lote'}
        </button>
        <button className="button button--secondary" disabled={saving} aria-controls={listId}
          onClick={() => void readBatches(undefined, true)}>Actualizar lotes</button>
      </div>
      <p ref={statusRef} className={announcement ? 'action-announcement' : undefined} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{announcement}</p>
      {actionError && <p ref={actionErrorRef} className="inline-error" role="alert" tabIndex={-1}>{actionError}</p>}
      {registered && <button className="button button--secondary" disabled={reading || Boolean(readError) || need.status !== 'activa'} onClick={() => {
        mutationLocked.current = false;
        prepareFocus.current = true;
        setRegistered(null);
        setListAnnouncement('Puedes solicitar otro lote mediante una nueva acción manual.');
      }}>Preparar otro lote</button>}
      {saving && <LoadingState label="Registrando solicitud de lote" />}
      {reading && <LoadingState label={batches.length ? 'Cargando más lotes' : 'Cargando listado de lotes'} />}
      {readError && <button className="button button--secondary" aria-controls={listId}
        onClick={() => void readBatches(readError.cursor, true)}>Reintentar lectura</button>}
      <div id={listId} aria-busy={reading}>
        {!reading && !readError && batches.length === 0 && <p className="muted-copy">Aún no hay solicitudes de lote registradas.</p>}
        {batches.length > 0 && <>
          <p className="muted-copy">{batches.length} solicitudes de lote mostradas.</p>
          <ul className="batch-list">
            {batches.map((batch) => <li className="batch-record" key={batch.batchId}>
              <div><strong>Solicitud manual</strong><span>{new Date(batch.createdAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
              <StatusBadge tone="neutral">Sin emails en este mock</StatusBadge>
              <span className="batch-count">{batch.createdInvitationCount} invitaciones · {batch.deliveryCounts.entregada} entregadas</span>
            </li>)}
          </ul>
        </>}
      </div>
      {nextCursor && !readError && <button className="button button--secondary" disabled={reading || saving} aria-controls={listId} onClick={() => {
        if (!readingRef.current) void readBatches(nextCursor, true);
      }}>Cargar más lotes</button>}
    </section>
  );
}

function CreateNeedForm({
  siteId,
  onCreated,
  onCancel,
}: {
  siteId: string;
  onCreated: (need: Need) => void;
  onCancel: () => void;
}) {
  const [bloodType, setBloodType] = useState<CreateNeedInput['requiredBloodType']>('O_POS');
  const [target, setTarget] = useState(5);
  const [radius, setRadius] = useState(10);
  const [urgency, setUrgency] = useState<CreateNeedInput['urgency']>('Normal');
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input: CreateNeedInput = {
      component: 'RBC',
      requiredBloodType: bloodType,
      targetConfirmations: target,
      siteId,
      radiusKm: radius,
      urgency,
      expiresInHours,
    };
    try {
      onCreated(await api.createHospitalNeed(input));
    } catch {
      setError('La necesidad no se creó. Revisa los valores y vuelve a intentarlo.');
      setSaving(false);
    }
  }

  return (
    <section className="panel create-need-panel" aria-labelledby="create-need-title">
      <div className="panel-heading"><div><h2 id="create-need-title">Nueva necesidad</h2><p>La necesidad se guarda como borrador local.</p></div></div>
      <form className="need-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Componente<select value="RBC" disabled><option value="RBC">Glóbulos rojos (RBC)</option></select></label>
          <label htmlFor="required-blood-type">Grupo solicitado
            <select id="required-blood-type" value={bloodType} onChange={(event) => setBloodType(event.currentTarget.value as CreateNeedInput['requiredBloodType'])}>
              <option value="O_NEG">O−</option><option value="O_POS">O+</option>
              <option value="A_NEG">A−</option><option value="A_POS">A+</option>
              <option value="B_NEG">B−</option><option value="B_POS">B+</option>
              <option value="AB_NEG">AB−</option><option value="AB_POS">AB+</option>
            </select>
          </label>
          <label htmlFor="target-confirmations">Meta de intenciones
            <input id="target-confirmations" type="number" min="1" max="50" value={target} onChange={(event) => setTarget(Number(event.currentTarget.value))} required />
          </label>
          <label htmlFor="need-radius">Radio de selección (km)
            <input id="need-radius" type="number" min="1" max="50" value={radius} onChange={(event) => setRadius(Number(event.currentTarget.value))} required />
          </label>
          <label htmlFor="need-urgency">Urgencia informativa
            <select id="need-urgency" value={urgency} onChange={(event) => setUrgency(event.currentTarget.value as CreateNeedInput['urgency'])}>
              <option value="Normal">Normal</option><option value="Urgente">Urgente</option><option value="Critica">Crítica</option>
            </select>
          </label>
          <label htmlFor="need-expiry">Vence en (horas)
            <input id="need-expiry" type="number" min="1" max="72" value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.currentTarget.value))} required />
          </label>
        </div>
        <Notice tone="info">El mock no selecciona donantes ni envía email cuando guardas una necesidad.</Notice>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
        </div>
      </form>
    </section>
  );
}

interface NeedWithResponses {
  need: Need;
  confirmedIntentCount: number;
  items: NeedResponse[];
}

export function HospitalResponsesPage() {
  const [groups, setGroups] = useState<NeedWithResponses[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api.getHospitalNeeds().then(async (needs) => Promise.all(needs.map(async (need) => ({
      need,
      ...await api.getHospitalNeedResponses(need.needId),
    })))).then((result) => {
      if (current) setGroups(result);
    }).catch(() => {
      if (current) setError('No se pudieron cargar las respuestas permitidas para esta institución.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  return (
    <>
      <PageHeading
        title="Respuestas"
        description="Consulta intenciones de asistir de necesidades propias."
        action={<button className="button button--secondary button--small" onClick={() => setReload((value) => value + 1)}><RotateCw size={15} aria-hidden="true" /> Actualizar</button>}
      />
      <Notice tone="info" title="Proyección limitada por estado">
        La identidad aparece solo mientras la intención está confirmada. Un rechazo vuelve a un código opaco, sin nombre ni grupo.
      </Notice>
      {loading && <LoadingState label="Cargando respuestas del hospital" />}
      {!loading && error && <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !error && groups?.length === 0 && <div className="empty-state"><h2>Sin necesidades</h2><p>Crea una necesidad para revisar respuestas de demostración.</p></div>}
      {!loading && !error && groups?.map(({ need, confirmedIntentCount, items }) => (
        <section className="panel response-group" key={need.needId}>
          <div className="panel-heading">
            <div><h2>{bloodTypeLabel(need.requiredBloodType)} · {need.urgency}</h2><p>{confirmedIntentCount} intenciones confirmadas · meta {need.targetConfirmations}</p></div>
            <StatusBadge tone={statusTone(need.status)}>{statusLabel(need.status)}</StatusBadge>
          </div>
          {items.length === 0 ? <p className="muted-copy">Aún no hay respuestas.</p> : (
            <ul className="response-list">
              {items.map((item) => {
                const isConfirmed = 'donorName' in item;
                return (
                  <li className="response-row" key={item.needDonorCode}>
                    <span className="response-code">{item.needDonorCode}</span>
                    <div className="response-row__identity">
                      {isConfirmed ? <><strong>{item.donorName}</strong><span>Grupo declarado {bloodTypeLabel(item.declaredBloodType)}</span></> : <><strong>Identidad protegida</strong><span>Disponible solo un código por necesidad</span></>}
                    </div>
                    <StatusBadge tone={item.response === 'confirmada' ? 'success' : item.response === 'rechazada' ? 'neutral' : 'warning'}>
                      {item.response === 'confirmada' ? 'Intención confirmada' : item.response === 'rechazada' ? 'No asistirá' : 'Sin respuesta'}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
