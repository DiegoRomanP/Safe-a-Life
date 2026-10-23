import { useEffect, useState } from 'react';
import { apiRequest, errorMessage } from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
import type { DonorInvitation } from '../types.js';
import { responseLabel, urgencyLabel } from '../labels.js';
export function InvitationsPage() {
  const [items,setItems] = useState<DonorInvitation[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  useEffect(() => {
    let alive=true;
    void apiRequest<{items:DonorInvitation[]}>('/api/v1/donors/me/invitations')
      .then(result=>{if(alive)setItems(result.items);})
      .catch(reason=>{if(alive)setError(errorMessage(reason));})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[]);
  return <>
    <PageHeader title="Mis invitaciones" description="Invitaciones registradas por hospitales para tu cuenta." />
    <Alert tone="info" title="Preselección académica">El grupo sanguíneo declarado solo sirve para una preselección; el hospital verifica la elegibilidad.</Alert>
    {loading ? <p>Cargando invitaciones…</p> : error ? <Alert tone="warning" title="No fue posible consultar invitaciones">{error}</Alert> :
      items.length===0 ? <EmptyState message="No tienes invitaciones registradas" detail="Aparecerán cuando un hospital genere invitaciones reales." /> :
      <section aria-label="Invitaciones" className="rounded-xl border border-line bg-surface px-6 py-2">
        <ul className="divide-y divide-line">{items.map(item=><li key={item.invitationId} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-start">
          <div><h2 className="text-lg font-semibold">{item.hospitalName}</h2><p>{item.publicSiteName}</p></div>
          <Badge tone={urgencyLabel[item.urgency].tone}>{urgencyLabel[item.urgency].label}</Badge>
          <Badge tone={responseLabel[item.response].tone}>{responseLabel[item.response].label}</Badge>
          <div><p>{formatDateTime(item.expiresAt)}</p><LinkButton to={`/donante/invitaciones/${item.invitationId}`} variant="secondary">Ver invitación</LinkButton></div>
        </li>)}</ul>
      </section>}
  </>;
}
