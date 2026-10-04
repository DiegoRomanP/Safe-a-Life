import { useEffect, useRef, useState } from 'react';
import { MapPin, RotateCw } from 'lucide-react';
import {
  api,
  type CreateCorrectionRequestInput,
  type DonorCorrectionRequest,
  type DonorInvitation,
  type DonorProfile,
  type DonorResponseHistoryItem,
} from '../api/client.js';
import { ErrorState, LoadingState, Notice, PageHeading, StatusBadge } from '../components/Ui.js';

function bloodTypeLabel(value: string): string {
  return value.replace('_NEG', '−').replace('_POS', '+');
}

function invitationTone(response: DonorInvitation['response']) {
  if (response === 'confirmada') return 'success' as const;
  if (response === 'rechazada') return 'neutral' as const;
  return 'warning' as const;
}

function invitationLabel(response: DonorInvitation['response']) {
  if (response === 'confirmada') return 'Intención confirmada';
  if (response === 'rechazada') return 'No asistirá';
  return 'Sin respuesta';
}

export function DonorInvitationsPage() {
  const [items, setItems] = useState<DonorInvitation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    api.getDonorInvitations().then((result) => {
      if (current) setItems(result);
    }).catch(() => {
      if (current) setLoadError('Las invitaciones no están disponibles en este momento.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    if (announcement) announcementRef.current?.focus();
  }, [announcement]);

  async function changeResponse(invitation: DonorInvitation, response: 'confirmada' | 'rechazada') {
    setBusyId(invitation.invitationId);
    setActionError(null);
    try {
      const updated = await api.changeInvitationResponse(invitation.invitationId, response);
      setItems((previous) => previous?.map((item) => item.invitationId === invitation.invitationId
        ? { ...item, response: updated.response }
        : item) ?? null);
      setAnnouncement(updated.response === 'confirmada'
        ? 'Tu intención de asistir quedó confirmada.'
        : 'Registramos que no asistirás; el hospital ya no ve tu nombre ni grupo.');
    } catch {
      setActionError('No se guardó el cambio. Revisa que la invitación siga activa e inténtalo otra vez.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeading
        title="Tus invitaciones"
        description="Revisa cada aviso y decide si deseas expresar una intención de asistir."
        action={<button className="button button--secondary button--small" onClick={() => setReload((value) => value + 1)}>
          <RotateCw size={15} aria-hidden="true" /> Actualizar
        </button>}
      />
      {announcement && <p ref={announcementRef} className="action-announcement" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{announcement}</p>}
      <Notice tone="info" title="Tu respuesta expresa una intención">
        No confirma una donación ni determina elegibilidad. El hospital no recibe datos identificables si cambias una confirmación a rechazo.
      </Notice>
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      {loading && <LoadingState label="Cargando tus invitaciones" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !loadError && items?.length === 0 && (
        <div className="empty-state"><h2>No tienes invitaciones activas</h2><p>Cuando un hospital envíe un aviso, aparecerá aquí.</p></div>
      )}
      {!loading && !loadError && Boolean(items?.length) && (
        <ul className="invitation-list">
          {items?.map((invitation) => {
            const expired = Date.parse(invitation.expiresAt) <= Date.now();
            const actionable = invitation.validity === 'activa' && !expired;
            const pending = busyId === invitation.invitationId;
            return (
              <li className="invitation-item" key={invitation.invitationId}>
                <div className="invitation-item__main">
                  <div className="invitation-item__topline">
                    <span className="invitation-item__hospital">{invitation.hospitalName}</span>
                    <StatusBadge tone={invitationTone(invitation.response)}>{invitationLabel(invitation.response)}</StatusBadge>
                  </div>
                  <h2>{invitation.publicSiteName}</h2>
                  <p className="invitation-item__summary">
                    Necesidad de glóbulos rojos · grupo declarado solicitado {bloodTypeLabel(invitation.requiredBloodType)}
                  </p>
                  <div className="invitation-item__details">
                    <span>Vence {new Date(invitation.expiresAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span>Urgencia informativa: {invitation.urgency}</span>
                  </div>
                  <p className="invitation-item__instructions">{invitation.instructions}</p>
                </div>
                <div className="invitation-item__actions" aria-label="Cambiar respuesta">
                  {!actionable && <span className="muted-copy">Esta invitación ya no admite cambios.</span>}
                  {actionable && invitation.response !== 'confirmada' && (
                    <button className="button button--primary" disabled={pending} onClick={() => void changeResponse(invitation, 'confirmada')}>
                      {pending ? 'Guardando…' : 'Confirmar intención'}
                    </button>
                  )}
                  {actionable && invitation.response !== 'rechazada' && (
                    <button className="button button--secondary" disabled={pending} onClick={() => void changeResponse(invitation, 'rechazada')}>
                      No asistiré
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function DonorProfilePage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    api.getDonorProfile().then((result) => {
      if (current) setProfile(result);
    }).catch(() => {
      if (current) setLoadError('No se pudo cargar tu perfil.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  async function changeAvailability(isAvailable: boolean) {
    setSaving(true);
    setActionError(null);
    try {
      setProfile(await api.updateDonorProfile({ isAvailable }));
    } catch {
      setActionError('No se guardó la disponibilidad. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="Mi perfil" description="Consulta los datos de tu propia cuenta de demostración." />
      {loading && <LoadingState label="Cargando tu perfil" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && profile && (
        <div className="profile-layout">
          <section className="panel profile-panel" aria-labelledby="profile-data-title">
            <div className="panel-heading"><div><h2 id="profile-data-title">Datos del perfil</h2><p>Solo visibles para tu cuenta.</p></div></div>
            <dl className="profile-facts">
              <div><dt>Nombre</dt><dd>{profile.name}</dd></div>
              <div><dt>Correo de demostración</dt><dd>{profile.email}</dd></div>
              <div><dt>Grupo declarado</dt><dd><span className="blood-type-mark">{bloodTypeLabel(profile.declaredBloodType)}</span><span className="muted-copy"> · no verificado en esta demo</span></dd></div>
              <div><dt>Ubicación</dt><dd><MapPin size={16} aria-hidden="true" /> Lima · ubicación aproximada</dd></div>
            </dl>
          </section>
          <section className="panel availability-panel" aria-labelledby="availability-title">
            <div className="panel-heading"><div><h2 id="availability-title">Disponibilidad</h2><p>Controla si recibes avisos de demostración.</p></div></div>
            <label className="availability-control">
              <input
                type="checkbox"
                checked={profile.isAvailable}
                disabled={saving}
                onChange={(event) => void changeAvailability(event.currentTarget.checked)}
              />
              <span><strong>{profile.isAvailable ? 'Disponible para recibir avisos' : 'No recibir avisos'}</strong><small>Este cambio afecta solo al estado sintético local.</small></span>
            </label>
            {saving && <p className="muted-copy" role="status">Guardando disponibilidad…</p>}
            {actionError && <div className="inline-error" role="alert">{actionError}</div>}
          </section>
          <Notice tone="warning" title="Preselección no significa elegibilidad">
            No se almacena fecha ni historial de donación. El hospital verifica la información por sus procesos profesionales.
          </Notice>
        </div>
      )}
    </>
  );
}

export function DonorHistoryPage() {
  const [items, setItems] = useState<DonorResponseHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api.getDonorResponseHistory().then((result) => {
      if (current) setItems(result);
    }).catch(() => {
      if (current) setError('No se pudo cargar tu historial de respuestas.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  return (
    <>
      <PageHeading title="Historial de respuestas" description="Un registro de tus propias intenciones de asistir." />
      <Notice tone="info" title="Una respuesta no confirma asistencia ni donación">
        El historial solo muestra el estado de tus respuestas y cuándo las registraste.
      </Notice>
      {loading && <LoadingState label="Cargando tu historial" />}
      {!loading && error && <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !error && items?.length === 0 && <div className="empty-state"><h2>Aún no tienes respuestas registradas</h2><p>Las respuestas a tus invitaciones aparecerán aquí.</p></div>}
      {!loading && !error && items && items.length > 0 && (
        <ol className="response-history-list">
          {items.map((item, index) => (
            <li className="response-history-row" key={`${item.invitationId}-${item.changedAt}-${index}`}>
              <span className={`history-marker${item.response === 'confirmada' ? ' history-marker--confirmed' : ''}`} aria-hidden="true" />
              <div className="response-history-row__copy">
                <strong>{item.response === 'confirmada' ? 'Intención de asistir confirmada' : 'Respuesta: no asistirá'}</strong>
                <span>{new Date(item.changedAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <StatusBadge tone={item.response === 'confirmada' ? 'success' : 'neutral'}>
                {item.response === 'confirmada' ? 'Confirmada' : 'Rechazada'}
              </StatusBadge>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

type CorrectionField = 'name' | 'email' | 'declaredBloodType';

const correctionFieldLabels: Record<CorrectionField | 'deletion', string> = {
  name: 'Nombre',
  email: 'Correo',
  declaredBloodType: 'Grupo declarado',
  deletion: 'Eliminación de datos',
};

function correctionStatusTone(status: DonorCorrectionRequest['status']) {
  if (status === 'completada' || status === 'aprobada') return 'success' as const;
  if (status === 'rechazada' || status === 'fallida') return 'danger' as const;
  if (status === 'en_ejecucion') return 'info' as const;
  return 'warning' as const;
}

export function DonorRequestsPage() {
  const [items, setItems] = useState<DonorCorrectionRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [reload, setReload] = useState(0);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    api.getDonorCorrectionRequests().then((result) => {
      if (current) setItems(result);
    }).catch(() => {
      if (current) setLoadError('No se pudieron cargar tus solicitudes.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    if (announcement) announcementRef.current?.focus();
  }, [announcement]);

  async function submitRequest(input: CreateCorrectionRequestInput) {
    setActionError(null);
    try {
      const created = await api.createDonorCorrectionRequest(input);
      const requestNumber = (items?.length ?? 0) + 1;
      setItems((previous) => [created, ...(previous ?? [])]);
      setShowForm(false);
      setAnnouncement(`Solicitud ${requestNumber} registrada. No se modificó tu perfil.`);
    } catch {
      setActionError('No se registró la solicitud. Revisa la sesión e inténtalo de nuevo.');
    }
  }

  return (
    <>
      <PageHeading
        title="Mis solicitudes"
        description="Sigue solicitudes de corrección o eliminación de tu propia cuenta."
        action={<button className="button button--primary button--small" onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Cerrar formulario' : 'Nueva solicitud'}
        </button>}
      />
      <Notice tone="warning" title="Solo datos sintéticos">
        El mock conserva el tipo y los campos solicitados, no los valores propuestos, y no ejecuta cambios reales del perfil.
      </Notice>
      {announcement && <p ref={announcementRef} className="action-announcement" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{announcement}</p>}
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      {showForm && <CorrectionRequestForm onCancel={() => setShowForm(false)} onSubmit={submitRequest} />}
      {loading && <LoadingState label="Cargando tus solicitudes" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !loadError && items?.length === 0 && <div className="empty-state"><h2>No tienes solicitudes</h2><p>Puedes iniciar una solicitud de corrección o eliminación de tu propia cuenta.</p></div>}
      {!loading && !loadError && items && items.length > 0 && (
        <ul className="donor-request-list">
          {items.map((item) => (
            <li className="donor-request-row" key={item.requestId}>
              <div><strong>{item.type === 'correccion' ? 'Corrección de datos' : 'Eliminación de datos'}</strong>
                <span>{item.type === 'correccion'
                  ? item.requestedFields.map((field) => correctionFieldLabels[field]).join(', ')
                  : 'Solicitud de eliminación de datos propios'}</span>
                <small>{new Date(item.createdAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
              </div>
              <StatusBadge tone={correctionStatusTone(item.status)}>{item.status.replaceAll('_', ' ')}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CorrectionRequestForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: CreateCorrectionRequestInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<'correccion' | 'eliminacion'>('correccion');
  const [fields, setFields] = useState<Record<CorrectionField, boolean>>({
    name: false,
    email: false,
    declaredBloodType: false,
  });
  const [saving, setSaving] = useState(false);
  const hasSelectedField = Object.values(fields).some(Boolean);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const input: CreateCorrectionRequestInput = type === 'eliminacion'
      ? { type: 'eliminacion' }
      : {
        type: 'correccion',
        changes: {
          ...(fields.name ? { name: 'Nombre sintético actualizado' } : {}),
          ...(fields.email ? { newEmail: 'cambio.demo@example.test' } : {}),
          ...(fields.declaredBloodType ? { declaredBloodType: 'A_POS' } : {}),
        },
      };
    await onSubmit(input);
    setSaving(false);
  }

  return (
    <section className="panel correction-request-panel" aria-labelledby="correction-request-title">
      <div className="panel-heading"><div><h2 id="correction-request-title">Nueva solicitud</h2><p>El mock guardará solo el tipo y los campos seleccionados.</p></div></div>
      <form className="need-form" onSubmit={submit}>
        <label className="request-type-label" htmlFor="correction-request-type">Tipo de solicitud
          <select id="correction-request-type" value={type} onChange={(event) => setType(event.currentTarget.value as typeof type)}>
            <option value="correccion">Corregir campos del perfil</option>
            <option value="eliminacion">Solicitar eliminación de datos</option>
          </select>
        </label>
        {type === 'correccion' && (
          <fieldset className="correction-fields">
            <legend>Selecciona los campos a corregir</legend>
            {(['name', 'email', 'declaredBloodType'] as const).map((field) => (
              <label key={field}>
                <input
                  type="checkbox"
                  checked={fields[field]}
                  onChange={(event) => setFields((current) => ({ ...current, [field]: event.currentTarget.checked }))}
                />
                {correctionFieldLabels[field]}
              </label>
            ))}
          </fieldset>
        )}
        <Notice tone="info">Los valores de ejemplo se descartan al recibir la solicitud; esta acción no cambia el perfil.</Notice>
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={saving || (type === 'correccion' && !hasSelectedField)}>
            {saving ? 'Registrando…' : 'Registrar solicitud'}
          </button>
        </div>
      </form>
    </section>
  );
}
