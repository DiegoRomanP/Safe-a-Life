from pathlib import Path
from datetime import datetime
import shutil

ROOT = Path.cwd()
if not (ROOT/'backend/src/composition.ts').exists() or not (ROOT/'frontend/src/features/donor/types.ts').exists():
    raise SystemExit('Ejecuta este script desde la raíz de Safe-a-Life-login.')
BACKUP = ROOT / ('respaldo_f6_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
FILES = {}
FILES['backend/supabase/migrations/20261023000000_donor_invitations_slice.sql'] = r'''-- F6, integración local de invitaciones en app. No se altera ninguna tabla existente.
-- Invitaciones emitidas por hospital, respuesta única actual e historial append-only.
create table if not exists app.donor_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  need_id uuid not null references app.needs(need_id),
  donor_id uuid not null references app.donor_profiles(donor_id),
  hospital_name text not null,
  site_name text not null,
  blood_type text not null,
  urgency text not null,
  instructions text not null,
  expires_at timestamptz not null,
  response text not null default 'sin_respuesta' check(response in ('sin_respuesta','confirmada','rechazada')),
  created_at timestamptz not null default now(),
  changed_at timestamptz,
  unique(need_id, donor_id)
);
create index if not exists donor_invitations_by_donor on app.donor_invitations(donor_id, created_at desc);
create table if not exists app.donor_invitation_history (
  history_id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references app.donor_invitations(invitation_id),
  donor_id uuid not null references app.donor_profiles(donor_id),
  response text not null check(response in ('confirmada','rechazada')),
  changed_at timestamptz not null default now()
);
create index if not exists donor_invitation_history_by_donor on app.donor_invitation_history(donor_id, changed_at desc);
alter table app.donor_invitations enable row level security;
alter table app.donor_invitations force row level security;
alter table app.donor_invitation_history enable row level security;
alter table app.donor_invitation_history force row level security;
-- Direct SQL access is intentionally unavailable. Operations below validate actor and membership.
revoke all on app.donor_invitations from anon, authenticated;
revoke all on app.donor_invitation_history from anon, authenticated;

create or replace function api.f6_my_invitations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitationId',i.invitation_id,'hospitalName',i.hospital_name,
    'publicSiteName',i.site_name,'requiredBloodType',i.blood_type,
    'urgency',i.urgency,'instructions',i.instructions,
    'expiresAt',to_char(i.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'validity',case when i.expires_at<=now() or n.status not in ('activa','meta_alcanzada') then 'vencida' else 'activa' end,
    'delivery','pendiente','response',i.response
  ) order by i.created_at desc),'[]'::jsonb)
  from app.donor_invitations i join app.needs n on n.need_id=i.need_id
  where i.donor_id=auth.uid() and app.current_actor_role()='donante'
$$;
create or replace function api.f6_my_history() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitationId',h.invitation_id,'response',h.response,
    'changedAt',to_char(h.changed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    order by h.changed_at desc),'[]'::jsonb)
  from app.donor_invitation_history h
  where h.donor_id=auth.uid() and app.current_actor_role()='donante'
$$;
create or replace function api.f6_reply(p_invitation_id uuid,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v app.donor_invitations; n app.needs;
begin
  if auth.uid() is null or app.current_actor_role()<>'donante' then return jsonb_build_object('kind','forbidden'); end if;
  if p_response not in ('confirmada','rechazada') then return jsonb_build_object('kind','invalid'); end if;
  select * into v from app.donor_invitations where invitation_id=p_invitation_id and donor_id=auth.uid() for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  select * into n from app.needs where need_id=v.need_id;
  if v.expires_at<=now() or n.status<>'activa' then return jsonb_build_object('kind','conflict'); end if;
  if v.response<>p_response then
    update app.donor_invitations set response=p_response,changed_at=now() where invitation_id=p_invitation_id;
    insert into app.donor_invitation_history(invitation_id,donor_id,response) values(p_invitation_id,auth.uid(),p_response);
  end if;
  return jsonb_build_object('kind','ok');
end $$;
-- Creates only compatible in-range invitations. The institutional admin is derived from JWT/membership.
create or replace function api.f6_generate(p_need_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n app.needs; v_count integer;
begin
  if auth.uid() is null or app.current_actor_role()<>'admin_hospitalario' then return jsonb_build_object('kind','forbidden'); end if;
  select * into n from app.needs where need_id=p_need_id and hospital_id=app.admin_hospital_id() for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if n.status<>'activa' or n.expires_at<=now() then return jsonb_build_object('kind','conflict'); end if;
  insert into app.donor_invitations(need_id,donor_id,hospital_name,site_name,blood_type,urgency,instructions,expires_at)
  select n.need_id,p.donor_id,h.public_name,s.public_name,n.required_blood_type,n.urgency,
         coalesce(s.public_instructions,'Consulta los detalles con el hospital.'),n.expires_at
  from app.donor_profiles p
  cross join app.hospitals h
  cross join app.sites s
  where h.hospital_id=n.hospital_id and s.site_id=n.site_id and s.hospital_id=n.hospital_id
    and p.status='activo' and p.is_available is true and p.latitude is not null
    and (case p.declared_blood_type
      when 'O_NEG' then true
      when 'O_POS' then n.required_blood_type in ('O_POS','A_POS','B_POS','AB_POS')
      when 'A_NEG' then n.required_blood_type in ('A_NEG','A_POS','AB_NEG','AB_POS')
      when 'A_POS' then n.required_blood_type in ('A_POS','AB_POS')
      when 'B_NEG' then n.required_blood_type in ('B_NEG','B_POS','AB_NEG','AB_POS')
      when 'B_POS' then n.required_blood_type in ('B_POS','AB_POS')
      when 'AB_NEG' then n.required_blood_type in ('AB_NEG','AB_POS')
      when 'AB_POS' then n.required_blood_type='AB_POS'
      else false end)
    and 6371*2*asin(least(1,sqrt(
      power(sin(radians((p.latitude-s.latitude)::float8)/2),2)+
      cos(radians(s.latitude::float8))*cos(radians(p.latitude::float8))*
      power(sin(radians((p.longitude-s.longitude)::float8)/2),2))))<=n.radius_km
  on conflict(need_id,donor_id) do nothing;
  get diagnostics v_count=row_count;
  return jsonb_build_object('kind','ok','created',v_count);
end $$;
revoke all on function api.f6_my_invitations(),api.f6_my_history(),api.f6_reply(uuid,text),api.f6_generate(uuid) from public,anon;
grant execute on function api.f6_my_invitations(),api.f6_my_history(),api.f6_reply(uuid,text),api.f6_generate(uuid) to authenticated;
'''
FILES['backend/src/modules/invitation-coordination/http/invitations.router.ts'] = r'''import type { Express } from 'express';
import { ApiError } from '../../../shared/http/errors.js';
import { sendData } from '../../../shared/http/respond.js';
import { guardsFor, requirePrincipal, requireIdempotencyKey, type HttpSecrets } from '../../../shared/http/route-helpers.js';
import { isCanonicalUuid } from '../../../shared/validation/uuid.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from '../../../shared/persistence/rpc.js';

function uuid(value: string): string {
  if (!isCanonicalUuid(value)) throw new ApiError('BAD_REQUEST');
  return value;
}
function result(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ApiError('INTERNAL_ERROR');
  return value as Record<string, unknown>;
}
function requireOk(value: unknown): Record<string, unknown> {
  const v = result(value);
  if (v.kind === 'ok') return v;
  if (v.kind === 'not_found') throw new ApiError('RESOURCE_NOT_FOUND');
  if (v.kind === 'conflict') throw new ApiError('STATE_CONFLICT');
  if (v.kind === 'invalid') throw new ApiError('VALIDATION_FAILED');
  if (v.kind === 'forbidden') throw new ApiError('ACCESS_DENIED');
  throw new ApiError('INTERNAL_ERROR');
}
export function registerInvitationRoutes(
  app: Express, dependencies: { secrets: HttpSecrets; forUser: (accessToken: string) => SupabaseClient },
): void {
  const guards = guardsFor(dependencies.secrets);
  const rpc = (res: Parameters<typeof requirePrincipal>[0], name: string, args: Record<string, unknown> = {}) =>
    callRpc(dependencies.forUser(requirePrincipal(res).accessToken), name, args);

  app.get('/api/v1/donors/me/invitations', ...guards.donorRead, async (_req, res) => {
    const rows = await rpc(res, 'f6_my_invitations');
    if (!Array.isArray(rows)) throw new ApiError('INTERNAL_ERROR');
    sendData(res, 200, { items: rows });
  });
  app.get('/api/v1/donors/me/response-history', ...guards.donorRead, async (_req, res) => {
    const rows = await rpc(res, 'f6_my_history');
    if (!Array.isArray(rows)) throw new ApiError('INTERNAL_ERROR');
    sendData(res, 200, { items: rows });
  });
  app.patch('/api/v1/donors/me/invitations/:invitationId/response', ...guards.donorWrite, async (req, res) => {
    requireIdempotencyKey(req);
    const invitationId = uuid(String(req.params.invitationId ?? ''));
    const response = req.body?.response;
    if (response !== 'confirmada' && response !== 'rechazada') throw new ApiError('VALIDATION_FAILED');
    requireOk(await rpc(res, 'f6_reply', { p_invitation_id: invitationId, p_response: response }));
    sendData(res, 200, { response });
  });
  app.post('/api/v1/hospitals/me/needs/:needId/invitations/generate', ...guards.adminWrite, async (req, res) => {
    requireIdempotencyKey(req);
    const needId = uuid(String(req.params.needId ?? ''));
    const data = requireOk(await rpc(res, 'f6_generate', { p_need_id: needId }));
    sendData(res, 200, { created: data.created });
  });
}
'''
FILES['frontend/src/features/donor/pages/InvitationsPage.tsx'] = r'''import { useEffect, useState } from 'react';
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
'''
FILES['frontend/src/features/donor/pages/HistoryPage.tsx'] = r'''import { useEffect, useState } from 'react';
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
'''
FILES['frontend/src/features/donor/pages/InvitationDetailPage.tsx'] = r'''import { useEffect, useState } from 'react';
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
'''
# Apply composition change safely with exact anchors
composition=ROOT/'backend/src/composition.ts'
original=composition.read_text(encoding='utf-8')
anchor="import { registerNeedsRoutes } from './modules/need-records/http/needs.router.js';"
mount='''      registerInvitationRoutes(app, { secrets: httpSecrets, forUser: (accessToken) => supabase.forUser(accessToken) });\n'''
if anchor not in original or 'registerInvitationRoutes(app,' in original:
    raise SystemExit('composition.ts no coincide con la versión examinada, o F6 ya fue añadido. No se modificó nada.')
new=original.replace(anchor,anchor+"\nimport { registerInvitationRoutes } from './modules/invitation-coordination/http/invitations.router.js';")
idx=new.index('      registerNeedsRoutes(app, {')
new=new[:idx]+mount+new[idx:]
FILES['backend/src/composition.ts']=new
for relative,content in FILES.items():
    path=ROOT/relative
    if path.exists():
        backup=BACKUP/relative;backup.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,backup)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(content,encoding='utf-8')
print('F6 insertado en:',ROOT)
print('Archivos escritos:',len(FILES))
print('Respaldo:',BACKUP)
print('IMPORTANTE: No se aplicó SQL automáticamente. Revisa/aplica la migración en tu BD local. No usar en producción sin revisión de seguridad.')
print('Verifica: npm run typecheck --workspace backend && npm run typecheck --workspace @save-a-life/frontend')
