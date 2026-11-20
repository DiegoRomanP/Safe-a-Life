import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { QueryView } from '../../../components/states/QueryView.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { bloodTypeLabel, formatDateTime } from '../../../lib/format.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { fetchNeedResponses } from '../api.js';
import { needCode } from '../labels.js';
import type { NeedResponse, NeedResponses } from '../types.js';

const validityLabel = { activa: 'Activa', invalidada: 'Invalidada', vencida: 'Vencida' } as const;
const deliveryLabel = { pendiente: 'Pendiente', enviada: 'Enviada', entregada: 'Entregada', fallida: 'Fallida' } as const;

// HOS-04 Respuestas. Datos de listOwnNeedResponses: las confirmadas muestran nombre y grupo declarado; las demás son opacas (código
// aleatorio de esta necesidad, estado y entrega). Nunca hay correo, ubicación ni distancia.
export function NeedResponsesPage() {
  const { needId = '' } = useParams();
  const load = useCallback(() => fetchNeedResponses(needId), [needId]);
  const query = useDemoQuery(load, needId);

  return (
    <>
      <Link to={`/hospital/necesidades/${encodeURIComponent(needId)}`} className="self-start rounded font-semibold text-petrol underline underline-offset-4">
        Volver a la necesidad
      </Link>
      <PageHeader title="Respuestas" description={`Respuestas de los donantes a ${needCode(needId)}.`} />
      <QueryView query={query} loadingMessage="Cargando las respuestas…" backTo="/hospital/necesidades" backLabel="Ir a necesidades">
        {(data) => <ResponseList data={data} />}
      </QueryView>
      <Alert tone="warning" title="Verificación profesional externa">
        El grupo que aparece es el declarado por la persona. El hospital verifica identidad, grupo y elegibilidad con sus procedimientos; una intención de asistir no confirma aptitud ni una donación.
      </Alert>
    </>
  );
}

function ResponseList({ data }: { data: NeedResponses }) {
  const { confirmedIntentCount, items } = data;
  return (
    <>
      <p aria-live="polite" className="text-sm text-muted">
        {`${confirmedIntentCount} ${confirmedIntentCount === 1 ? 'intención confirmada' : 'intenciones confirmadas'}`}
      </p>
      {items.length === 0 ? (
        <EmptyState message="Todavía no hay invitaciones" detail="Cuando envíes un lote, aquí verás el estado de cada invitación." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-6">
          {items.map((item) => <ResponseRow key={item.needDonorCode} item={item} />)}
        </ul>
      )}
    </>
  );
}

function ResponseRow({ item }: { item: NeedResponse }) {
  if (item.response === 'confirmada') {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <p className="font-semibold text-ink">{item.donorName}</p>
          <p className="text-sm text-muted">{`${item.needDonorCode} · Grupo declarado ${bloodTypeLabel(item.declaredBloodType)} · ${formatDateTime(item.responseRecordedAt)}`}</p>
        </div>
        <Badge tone="success">Intención confirmada</Badge>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <p className="font-semibold text-ink">{item.needDonorCode}</p>
        <p className="text-sm text-muted">{`${validityLabel[item.validity]} · Entrega ${deliveryLabel[item.delivery].toLowerCase()}`}</p>
      </div>
      <Badge tone={item.response === 'rechazada' ? 'neutral' : 'info'}>{item.response === 'rechazada' ? 'No podrá asistir' : 'Sin respuesta'}</Badge>
    </li>
  );
}
