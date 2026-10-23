import { Link } from 'react-router-dom';
import { StatCard } from '../../../components/ui/StatCard.js';
import { Card } from '../../../components/ui/Card.js';
import { buttonClass } from '../../../components/ui/Button.js';
import { PageIntro, ReadBoundary, useAdminRead } from '../components/AdminStates.js';
import { adminPath, tasks } from '../httpGateway.js';
import { formatLima } from '../format.js';
import type { Task } from '../types.js';

const labels: Record<Task['kind'], string> = { correction_request: 'Solicitud de privacidad', hospital_review: 'Revisión institucional', recognition_policy: 'Política de reconocimiento', delivery_failure: 'Fallo de entrega' };
const targets: Record<Task['kind'], string | null> = { correction_request: '/superadmin/solicitudes', hospital_review: '/superadmin/sedes', recognition_policy: null, delivery_failure: '/superadmin/auditoria' };
export function TasksPage() {
  const read = useAdminRead(adminPath + '/task-queue', tasks);
  return <>
    <PageIntro title="Tareas administrativas" description="Consulta las acciones pendientes que informa el servidor." />
    <ReadBoundary {...read}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([...new Set(read.data?.map((task) => task.kind) ?? [])]).map((kind) => <StatCard key={kind} value={read.data?.filter((t) => t.kind === kind).length ?? 0} label={labels[kind]} />)}</div>
      <Card title="Prioridad de revisión">{!read.data?.length && <p role="status">No hay tareas disponibles en esta cola.</p>}<ul className="divide-y divide-line">{read.data?.map((t) => <li key={t.taskId} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h3 className="font-semibold">{labels[t.kind]}</h3><p className="mt-1 text-sm text-muted">{t.resourceCode || t.taskId} · {formatLima(t.createdAt)}</p></div>{targets[t.kind] ? <Link className={buttonClass('secondary')} to={targets[t.kind]!}>Revisar</Link> : <p className="text-sm text-muted">Gestión de políticas pendiente de integración.</p>}</li>)}</ul></Card>
    </ReadBoundary>
  </>;
}


