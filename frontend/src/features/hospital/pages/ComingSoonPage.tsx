import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { Alert } from '../../../components/ui/Alert.js';

// Lotes de invitación y respuestas dependen de la coordinación de invitaciones, que el backend aún no implementa
// (invitation-batches y responses no tienen ruta). Se dice con claridad en vez de mostrar datos inventados.
export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  const { needId = '' } = useParams();
  return (
    <>
      <Link to={`/hospital/necesidades/${encodeURIComponent(needId)}`} className="self-start rounded font-semibold text-petrol underline underline-offset-4">
        Volver a la necesidad
      </Link>
      <PageHeader title={title} description={description} />
      <Alert tone="info" title="Todavía no disponible">
        Esta función se habilita cuando esté lista la coordinación de invitaciones a donantes. Por ahora no hay datos que mostrar.
      </Alert>
    </>
  );
}
