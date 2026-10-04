import { useEffect, useState } from 'react';
import { api, type AuditEvent, type HospitalRecord, type SuperadminTask } from '../api/client.js';
import { ErrorState, LoadingState, Notice, PageHeading, StatusBadge } from '../components/Ui.js';

function useLoadedData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    load().then((result) => {
      if (current) setData(result);
    }).catch(() => {
      if (current) setError('La vista administrativa no está disponible en este momento.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [load, reload]);

  return { data, loading, error, retry: () => setReload((value) => value + 1) };
}

function taskLabel(kind: SuperadminTask['kind']) {
  if (kind === 'correction_request') return 'Solicitud de datos';
  if (kind === 'hospital_review') return 'Revisión de hospital';
  return 'Política de reconocimiento';
}

export function SuperadminTasksPage() {
  const { data, loading, error, retry } = useLoadedData(api.getSuperadminTasks);
  return (
    <>
      <PageHeading title="Tareas administrativas" description="Elementos pendientes identificados con códigos opacos." />
      <Notice tone="info" title="Acceso administrativo minimizado">
        Esta vista no permite buscar ni abrir el padrón de donantes.
      </Notice>
      {loading && <LoadingState label="Cargando tareas administrativas" />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data?.length === 0 && <div className="empty-state"><h2>Sin tareas pendientes</h2><p>Las tareas nuevas aparecerán aquí.</p></div>}
      {!loading && !error && data && data.length > 0 && (
        <ul className="admin-task-list">
          {data.map((task) => (
            <li className="admin-task-row" key={task.taskId}>
              <div><span className="admin-task-row__eyebrow">{taskLabel(task.kind)}</span><strong>{task.resourceCode ?? task.taskId}</strong></div>
              <span>{new Date(task.createdAt).toLocaleDateString('es-PE', { dateStyle: 'medium' })}</span>
              <StatusBadge tone="warning">Revisión pendiente</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SuperadminHospitalsPage() {
  const { data, loading, error, retry } = useLoadedData(api.getHospitals);
  return (
    <>
      <PageHeading title="Hospitales autorizados" description="Catálogo institucional sintético del entorno local." />
      {loading && <LoadingState label="Cargando hospitales" />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data?.length === 0 && <div className="empty-state"><h2>No hay hospitales en el catálogo</h2><p>Los hospitales sintéticos autorizados aparecerán aquí.</p></div>}
      {!loading && !error && data && (
        <ul className="institution-list">
          {data.map((hospital: HospitalRecord) => (
            <li className="institution-row" key={hospital.hospitalId}>
              <div><strong>{hospital.publicName}</strong><span>{hospital.legalName}</span></div>
              <StatusBadge tone={hospital.isAuthorized ? 'success' : 'warning'}>{hospital.isAuthorized ? 'Autorizado' : 'En revisión'}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SuperadminAuditPage() {
  const { data, loading, error, retry } = useLoadedData(api.getAuditEvents);
  return (
    <>
      <PageHeading title="Auditoría minimizada" description="Eventos sintéticos con referencias opacas y sin valores personales." />
      {loading && <LoadingState label="Cargando eventos de auditoría" />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data?.length === 0 && <div className="empty-state"><h2>Sin eventos de auditoría</h2><p>Los cambios administrativos se registrarían aquí.</p></div>}
      {!loading && !error && data && (
        <ul className="audit-list">
          {data.map((event: AuditEvent) => (
            <li className="audit-row" key={event.eventId}>
              <div className="audit-row__event"><strong>{event.event}</strong><span>{event.actorCode}</span></div>
              <span className="audit-row__resource">{event.resourceCode}</span>
              <StatusBadge tone={event.result === 'ok' ? 'success' : event.result === 'denegado' ? 'warning' : 'danger'}>{event.result}</StatusBadge>
              <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SuperadminConfigurationPage() {
  const { data, loading, error, retry } = useLoadedData(api.getConfiguration);
  return (
    <>
      <PageHeading title="Configuración" description="Parámetros permitidos para la demostración local." />
      {loading && <LoadingState label="Cargando configuración" />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && !error && data && (
        <section className="panel configuration-panel">
          <dl className="profile-facts">
            <div><dt>Fecha final de demostración</dt><dd>{data.finalDemoAt ? new Date(data.finalDemoAt).toLocaleString('es-PE') : 'No configurada'}</dd></div>
            <div><dt>Estado de configuración</dt><dd><StatusBadge tone={data.isImmutable ? 'neutral' : 'info'}>{data.isImmutable ? 'Inmutable' : 'Abierta en el mock'}</StatusBadge></dd></div>
          </dl>
          <Notice tone="warning">Los parámetros no contienen reglas clínicas ni activan automatizaciones.</Notice>
        </section>
      )}
    </>
  );
}
