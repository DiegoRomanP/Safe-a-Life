import { useEffect, useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { apiRequest,createMutationIntent,errorMessage } from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { formatDateTime } from '../../../lib/format.js';
import type { DonorInvitation } from '../types.js';
import { urgencyLabel,responseLabel } from '../labels.js';
export function InvitationDetailPage(){
 const {invitationId}=useParams();
 const [item,setItem]=useState<DonorInvitation|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;
  void apiRequest<{items:DonorInvitation[]}>('/api/v1/donors/me/invitations')
   .then(d=>{if(alive)setItem(d.items.find(i=>i.invitationId===invitationId)??null);})
   .catch(e=>{if(alive)setError(errorMessage(e));})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[invitationId]);
 async function reply(response:'confirmada'|'rechazada'){
  if(!item||busy||item.response===response)return;
  setBusy(true);setError('');setSaved(false);
  try{
   const path=`/api/v1/donors/me/invitations/${item.invitationId}/response`;
   const body={response};const intent=createMutationIntent();
   await apiRequest(path,{method:'PATCH',body,idempotencyKey:intent.keyFor(path,body)});
   setItem({...item,response});setSaved(true);
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 return <>
  <Link to="/donante/invitaciones" className="font-semibold text-petrol underline">Volver a invitaciones</Link>
  <PageHeader title="Detalle de invitación" description="Consulta y responde tu invitación real." />
  {loading?<p>Cargando…</p>:error?<Alert tone="warning" title="No se pudo completar la operación">{error}</Alert>:!item?
   <Alert tone="warning" title="Invitación no encontrada">No hay invitación registrada para tu cuenta con ese identificador.</Alert>:
   <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
    <h2 className="text-xl font-semibold">{item.hospitalName} · {item.publicSiteName}</h2>
    <Badge tone={urgencyLabel[item.urgency].tone}>{urgencyLabel[item.urgency].label}</Badge>
    <p>Tipo requerido: {item.requiredBloodType}</p><p>Plazo: {formatDateTime(item.expiresAt)}</p>
    <p>{item.instructions}</p>
    <Badge tone={responseLabel[item.response].tone}>{responseLabel[item.response].label}</Badge>
    {saved&&<Alert tone="info" title="Respuesta guardada">Tu decisión se guardó en PostgreSQL.</Alert>}
    {item.validity==='activa'&&<div className="flex gap-3 flex-wrap">
      <Button disabled={busy||item.response==='confirmada'} onClick={()=>{void reply('confirmada');}}>Confirmar intención de asistir</Button>
      <Button disabled={busy||item.response==='rechazada'} variant="ghost" onClick={()=>{void reply('rechazada');}}>No podré asistir</Button>
    </div>}
    <Alert tone="info" title="Importante">Registrar una intención no confirma una donación.</Alert>
   </section>}
 </>;
}
