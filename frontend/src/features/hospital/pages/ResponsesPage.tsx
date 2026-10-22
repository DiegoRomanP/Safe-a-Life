import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { StatCard } from '../../../components/ui/StatCard.js';
import { bloodTypeLabel } from '../../../lib/format.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';
import { deliveryLabel, needCode, responseLabel, validityLabel } from '../labels.js';

// La proyección de una confirmación no trae vigencia ni entrega.
const notInProjection = <span className="text-muted">No informado</span>;

// HOS-05 Respuestas (Penpot «+»). Proyección de listOwnNeedResponses: antes de
// una confirmación afirmativa la identidad queda oculta y solo se ven código
// opaco, vigencia, entrega y respuesta. Una confirmación muestra además nombre
// y grupo declarado. Nunca correo, teléfono, ubicación ni distancia.
export function ResponsesPage() {
  const { needId = '' } = useParams();
  const { needs, responsesOf } = useHospitalDemo();
  const need = needs.find((item) => item.needId === needId);
  const backLink = (
    <Link
      to={need ? `/hospital/necesidades/${need.needId}` : '/hospital/necesidades'}
      className="self-start rounded font-semibold text-petrol underline underline-offset-4"
    >
      {need ? 'Volver a la necesidad' : 'Volver a necesidades'}
    </Link>
  );

  if (!need) {
    return (
      <>
        {backLink}
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-3xl font-bold text-ink">No pudimos abrir estas respuestas</h1>
          <p className="text-muted">Puede que la necesidad no exista o que no pertenezca a tu hospital.</p>
        </section>
      </>
    );
  }

  const code = needCode(need.needId);
  const items = responsesOf(need.needId);
  const count = (response: string) => items.filter((item) => item.response === response).length;

  return (
    <>
      {backLink}
      <PageHeader
        title={`Respuestas · ${code}`}
        description="Antes de una confirmación afirmativa, las identidades permanecen ocultas."
      />
      <section aria-label="Resumen de respuestas" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard value={items.length} label="Invitaciones" accent="petrol" />
        <StatCard value={count('confirmada')} label="Confirmadas" accent="success" />
        <StatCard value={count('rechazada')} label="Rechazadas" accent="muted" />
        <StatCard value={count('sin_respuesta')} label="Sin respuesta" accent="warning" />
      </section>
      {items.length === 0 ? (
        <EmptyState message="Todavía no hay invitaciones para esta necesidad" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left">
            <caption className="sr-only">{`Respuestas de ${code}`}</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-4 py-4 font-semibold">Código</th>
                <th scope="col" className="px-4 py-4 font-semibold">Vigencia</th>
                <th scope="col" className="px-4 py-4 font-semibold">Entrega</th>
                <th scope="col" className="px-4 py-4 font-semibold">Respuesta</th>
                <th scope="col" className="px-4 py-4 font-semibold">Identidad permitida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.needDonorCode} className="text-ink">
                  <th scope="row" className="px-4 py-4 font-semibold">{item.needDonorCode}</th>
                  <td className="px-4 py-4">{item.response === 'confirmada' ? notInProjection : validityLabel[item.validity]}</td>
                  <td className="px-4 py-4">{item.response === 'confirmada' ? notInProjection : deliveryLabel[item.delivery]}</td>
                  <td className="px-4 py-4">{responseLabel[item.response]}</td>
                  <td className="px-4 py-4">
                    {item.response === 'confirmada'
                      ? `${item.donorName} · ${bloodTypeLabel(item.declaredBloodType)}`
                      : 'Oculta'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Alert tone="brand" title="Minimización de datos">
        Nunca se muestra correo, teléfono, ID global, ubicación, coordenadas ni distancia.
      </Alert>
    </>
  );
}
