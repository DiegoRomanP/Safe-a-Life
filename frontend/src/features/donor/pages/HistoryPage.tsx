import { useEffect, useState } from 'react';
import { apiRequest,errorMessage } from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Card } from '../../../components/ui/Card.js';
import { formatDateTime } from '../../../lib/format.js';
import type { ResponseHistoryItem,DonorInvitation } from '../types.js';
import { historyLabel } from '../labels.js';
export function HistoryPage(){
 const [history,setHistory]=useState<ResponseHistoryItem[]>([]);
 const [invitations,setInvitations]=useState<DonorInvitation[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let alive=true;
  void Promise.all([
    apiRequest<{items:ResponseHistoryItem[]}>('/api/v1/donors/me/response-history'),
    apiRequest<{items:DonorInvitation[]}>('/api/v1/donors/me/invitations'),
  ]).then(([h,i])=>{if(alive){setHistory(h.items);setInvitations(i.items);}})
    .catch(e=>{if(alive)setError(errorMessage(e));})
    .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[]);
 return <>
  <PageHeader title="Historial de respuestas" description="Respuestas guardadas en PostgreSQL." />
  {loading?<p>Cargando historial…</p>:error?<Alert tone="warning" title="No se pudo cargar">{error}</Alert>:
   history.length===0?<EmptyState message="Todavía no respondiste invitaciones" detail="Tus respuestas aparecerán aquí cuando se guarden." />:
   <Card title="Registro de respuestas"><ol className="flex flex-col gap-4">{history.map((h,index)=><li key={`${h.invitationId}-${h.changedAt}-${index}`}>
     <p className="font-semibold">{historyLabel[h.response]}</p>
     <p>{invitations.find(i=>i.invitationId===h.invitationId)?.hospitalName??'Invitación'}</p>
     <p className="text-sm text-muted">{formatDateTime(h.changedAt)}</p>
   </li>)}</ol></Card>}
  <Alert tone="info" title="Alcance">Una respuesta no confirma donación ni elegibilidad.</Alert>
 </>;
}
