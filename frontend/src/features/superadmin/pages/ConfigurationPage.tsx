import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button.js';
import { Input } from '../../../components/ui/Input.js';
import { Card } from '../../../components/ui/Card.js';
import { Alert } from '../../../components/ui/Alert.js';
import { ActionNotice, PageIntro, ReadBoundary, useAdminAction, useAdminRead } from '../components/AdminStates.js';
import { adminPath, configuration } from '../httpGateway.js';
import { formatLima, limaInputToIso } from '../format.js';

export function ConfigurationPage() {
  const path = adminPath + '/configuration';
  const read = useAdminRead(path, configuration);
  const action = useAdminAction();
  const [date, setDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const immutable = read.data?.isImmutable ?? true;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) { setError('Confirma que comprendes que esta fecha no podrá modificarse.'); return; }
    const iso = limaInputToIso(date);
    if (!iso) { setError('Selecciona una fecha y hora válidas de Lima.'); return; }
    setError('');
    void action.execute(path, 'PATCH', { finalDemoAt: iso }, read.retry);
  };
  return <>
    <PageIntro title="Configuración versionada" description="Administra parámetros permitidos sin introducir reglas clínicas." />
    <Alert tone="brand" title="Configuración crítica"><p>La fecha final de demo se guarda una sola vez y queda inmutable. Esta acción requiere autenticación reforzada reciente.</p></Alert>
    <ReadBoundary {...read}>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"><Card title="Parámetros del prototipo"><form onSubmit={submit} className="sa-form"><label htmlFor="sa-final-date">Fecha final de demo · Lima, UTC−5<Input id="sa-final-date" type="datetime-local" required value={date} onChange={(event) => { setDate(event.target.value); setConfirmed(false); }} disabled={immutable || action.pending} aria-describedby="sa-final-help" /></label><p id="sa-final-help" className="text-sm text-muted">La hora ingresada se interpreta siempre en Lima. Una vez guardada será inmutable.</p>{read.data?.finalDemoAt && <p role="status" className="font-semibold">Fecha fijada: {formatLima(read.data.finalDemoAt)}</p>}<label htmlFor="sa-matrix">Matriz académica<Input id="sa-matrix" readOnly value="MATRIZ_RBC_ACADEMICA_V1" /></label><p className="text-sm text-muted">Identificador académico para datos sintéticos. No es una fuente clínica oficial ni certifica elegibilidad.</p>{error && <p role="alert" className="text-danger">{error}</p>}<label htmlFor="sa-final-confirm" className="flex items-start gap-3 text-sm"><input id="sa-final-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={immutable || action.pending} className="mt-1 size-4 shrink-0 accent-petrol" />Confirmo que esta fecha quedará fija y determina los plazos de retención del prototipo.</label><Button type="submit" disabled={immutable || action.pending || !confirmed}>{immutable ? 'Fecha fijada · inmutable' : action.pending ? 'Guardando…' : 'Guardar fecha final'}</Button><ActionNotice {...action} /></form></Card><Card title="Límites vigentes"><dl className="sa-metadata"><dt>Datos</dt><dd>Solo sintéticos</dd><dt>Componente</dt><dd>Glóbulos rojos (RBC)</dd><dt>Ubicación</dt><dd>Polígono de Lima</dd><dt>Retención</dt><dd>El proceso de purga del backend toma como referencia los 30 días posteriores a la fecha final.</dd></dl></Card></div>
    </ReadBoundary>
  </>;
}

