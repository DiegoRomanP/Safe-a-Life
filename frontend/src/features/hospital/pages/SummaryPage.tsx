import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { StatCard } from '../../../components/ui/StatCard.js';
import { NeedsTable } from '../components/NeedsTable.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';

// HOS-01 Resumen operativo (Penpot «+»). Datos de listOwnHospitalNeeds. Los
// indicadores salen solo de esa lista: el contrato no entrega al hospital
// «entregas pendientes» ni «tareas por revisar».
export function SummaryPage() {
  const { needs } = useHospitalDemo();
  const count = (status: string) => needs.filter((need) => need.status === status).length;
  const confirmed = needs
    .filter((need) => need.status === 'activa' || need.status === 'meta_alcanzada')
    .reduce((total, need) => total + need.confirmedIntentCount, 0);
  const attention = needs.filter((need) => need.status === 'activa' || need.status === 'borrador');

  return (
    <>
      <PageHeader
        title="Resumen operativo"
        description="Monitorea necesidades y confirmaciones de intención de tu hospital."
        actions={<LinkButton to="/hospital/necesidades/nueva">Crear necesidad</LinkButton>}
      />
      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard value={count('activa')} label="Necesidades activas" accent="petrol" />
        <StatCard value={count('meta_alcanzada')} label="Metas alcanzadas" accent="success" />
        <StatCard value={confirmed} label="Intenciones confirmadas" accent="warning" />
        <StatCard value={count('borrador')} label="Borradores" accent="muted" />
      </section>
      <section aria-labelledby="atencion-titulo" className="flex flex-col gap-4">
        <h2 id="atencion-titulo" className="text-xl font-semibold text-ink">
          Necesidades que requieren atención
        </h2>
        {attention.length === 0 ? (
          <EmptyState message="No hay necesidades activas ni borradores" detail="Crea una necesidad para empezar." />
        ) : (
          <NeedsTable needs={attention} caption="Necesidades activas y borradores" />
        )}
      </section>
      <Alert tone="info" title="Datos mínimos">
        Las confirmaciones se muestran sin datos fuera de la lista permitida.
      </Alert>
    </>
  );
}
