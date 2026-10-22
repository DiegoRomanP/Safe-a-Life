import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { NeedsTable } from '../components/NeedsTable.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';

// Lista completa de necesidades del hospital (listOwnHospitalNeeds), destino
// de «Necesidades» en la navegación. Usa la tabla de HOS-01.
export function NeedsPage() {
  const { needs } = useHospitalDemo();

  return (
    <>
      <PageHeader
        title="Necesidades"
        description="Todas las necesidades de tu hospital, con su meta de intenciones y vencimiento."
        actions={<LinkButton to="/hospital/necesidades/nueva">Crear necesidad</LinkButton>}
      />
      {needs.length === 0 ? (
        <EmptyState message="Todavía no hay necesidades" detail="Crea una necesidad para empezar." />
      ) : (
        <NeedsTable needs={needs} caption="Necesidades del hospital" />
      )}
    </>
  );
}
