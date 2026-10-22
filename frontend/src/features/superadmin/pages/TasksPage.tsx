import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Badge } from '../../../components/ui/Badge.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { StatCard } from '../../../components/ui/StatCard.js';
import { formatDateTime } from '../../../lib/format.js';
import { requestCode, taskKindLabel } from '../labels.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';
import type { SuperadminTask } from '../types.js';

// SA-01 Tareas administrativas (Penpot «+»). Datos de listSuperadminTasks: tipo,
// fecha y código opaco del recurso; nunca datos del padrón de donantes.
export function TasksPage() {
  const { tasks, requests } = useSuperadminDemo();
  const count = (kind: SuperadminTask['kind']) => tasks.filter((task) => task.kind === kind).length;
  const sorted = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Destino de «Revisar» según el tipo. Las políticas de reconocimiento son
  // borrador en el contrato y todavía no tienen vista.
  function targetOf(task: SuperadminTask): string | null {
    if (task.kind === 'correction_request') {
      const request = requests.find((item) => requestCode(item.requestId) === task.resourceCode);
      return request ? `/superadmin/solicitudes/${request.requestId}` : '/superadmin/solicitudes';
    }
    if (task.kind === 'hospital_review') return '/superadmin/sedes';
    if (task.kind === 'delivery_failure') return '/superadmin/administradores';
    return null;
  }

  return (
    <>
      <PageHeader title="Tareas administrativas" description="Resuelve acciones pendientes sin navegar el padrón de donantes." />
      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard value={count('correction_request')} label="Solicitudes pendientes" accent="warning" />
        <StatCard value={count('hospital_review')} label="Sedes por revisar" accent="petrol" />
        <StatCard value={count('delivery_failure')} label="Fallos de entrega" accent="danger" />
        <StatCard value={count('recognition_policy')} label="Políticas por moderar" accent="muted" />
      </section>
      <section aria-labelledby="prioridad-titulo" className="flex flex-col gap-4">
        <h2 id="prioridad-titulo" className="text-xl font-semibold text-ink">
          Prioridad de revisión
        </h2>
        {sorted.length === 0 ? (
          <EmptyState message="No hay tareas pendientes" detail="Cuando aparezca una, la verás aquí." />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface px-6">
            {sorted.map((task) => {
              const target = targetOf(task);
              return (
                <li key={task.taskId} className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-ink">{taskKindLabel[task.kind]}</h3>
                    <p className="text-sm text-muted">{task.resourceCode ?? 'Sin código'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <Badge tone="warning">Pendiente</Badge>
                    <p className="text-sm text-ink">{formatDateTime(task.createdAt)}</p>
                    {target && (
                      <LinkButton to={target} variant="secondary">
                        Revisar<span className="sr-only"> {task.resourceCode}</span>
                      </LinkButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
