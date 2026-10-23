from pathlib import Path
from datetime import datetime
import shutil

root=Path.cwd()
page=root/'frontend/src/features/hospital/pages/HospitalHomePage.tsx'
if not page.exists() or not (root/'frontend/src/api/client.ts').exists():
    raise SystemExit('ERROR: ejecuta desde Safe-a-Life-login después del parche de acceso Hospital.')
if 'Hospital · Necesidades' not in page.read_text(encoding='utf-8'):
    raise SystemExit('ERROR: la pantalla ha cambiado respecto a la versión revisada; no se sobrescribió.')
backup=root/('respaldo_hospital_completo_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir()
shutil.copy2(page,backup/page.name)
page.write_text(r'''import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, createMutationIntent, errorMessage } from '../../../api/client.js';
import { getSession } from '../../../api/auth.js';

type NeedStatus = 'borrador' | 'activa' | 'meta_alcanzada' | 'cerrada' | 'cancelada' | 'vencida';
type Blood = 'O_NEG' | 'O_POS' | 'A_NEG' | 'A_POS' | 'B_NEG' | 'B_POS' | 'AB_NEG' | 'AB_POS';
type Need = { needId: string; requiredBloodType: Blood; targetConfirmations: number; confirmedIntentCount: number; siteId: string; radiusKm: number; urgency: string; status: NeedStatus; expiresAt: string };
type Site = { siteId: string; publicName: string };
type Paged<T> = { items: T[]; pagination?: { nextCursor?: string | null } };
const bloods: Blood[] = ['O_NEG','O_POS','A_NEG','A_POS','B_NEG','B_POS','AB_NEG','AB_POS'];
const bloodNames: Record<Blood,string> = {O_NEG:'O−',O_POS:'O+',A_NEG:'A−',A_POS:'A+',B_NEG:'B−',B_POS:'B+',AB_NEG:'AB−',AB_POS:'AB+'};
const field = 'w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-ink';
const secondary = 'rounded-lg border border-line px-4 py-2 text-ink disabled:opacity-50';
const primary = 'rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50';

export function HospitalHomePage() {
  const navigate = useNavigate();
  const [hospitalName,setHospitalName] = useState('Hospital autorizado');
  const [needs,setNeeds] = useState<Need[]>([]);
  const [sites,setSites] = useState<Site[]>([]);
  const [siteId,setSiteId] = useState('');
  const [blood,setBlood] = useState<Blood>('O_POS');
  const [urgency,setUrgency] = useState('Normal');
  const [target,setTarget] = useState(1);
  const [radius,setRadius] = useState(10);
  const [hours,setHours] = useState(24);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [revision,setRevision] = useState(0);
  const intent = useRef(createMutationIntent());
  const mutationBusy = useRef(false);
  const refresh = useCallback(() => setRevision(n=>n+1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      apiRequest<Paged<Need>>('/api/v1/hospitals/me/needs?limit=50', {signal:controller.signal}),
      apiRequest<Paged<Site>>('/api/v1/hospitals/me/sites?limit=50', {signal:controller.signal}),
      getSession(),
    ]).then(([needPage,sitePage,session])=>{
      if(controller.signal.aborted) return;
      if(!Array.isArray(needPage.items) || !Array.isArray(sitePage.items)) throw new Error('Formato de respuesta no válido');
      setNeeds(needPage.items); setSites(sitePage.items);
      setSiteId(old=>old && sitePage.items.some(s=>s.siteId===old) ? old : (sitePage.items[0]?.siteId ?? ''));
      setHospitalName(session.actor.hospitalName || 'Hospital autorizado'); setError('');
    }).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[revision]);

  async function action(path:string, method:'POST'|'PATCH', body?:unknown, success='Operación guardada en PostgreSQL.') {
    if(mutationBusy.current)return;
    mutationBusy.current=true;setBusy(true);setError('');setNotice('');
    try {
      await apiRequest(path,{method, ...(body===undefined?{}:{body}),idempotencyKey:intent.current.keyFor(path,body??null)});
      intent.current.reset();setNotice(success);refresh();
    } catch(e) { setError(errorMessage(e)); }
    finally {mutationBusy.current=false;setBusy(false);}
  }
  function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!siteId || !Number.isInteger(target) || target<1 || target>50 || !Number.isInteger(radius) || radius<1 || radius>50 || !Number.isInteger(hours) || hours<1 || hours>72){
      setError('Revisa sede, meta (1–50), radio (1–50 km) y duración (1–72 horas).');return;
    }
    void action('/api/v1/hospitals/me/needs','POST',{component:'RBC',siteId,requiredBloodType:blood,targetConfirmations:target,radiusKm:radius,urgency,expiresInHours:hours},'Necesidad creada. Puedes activarla desde el listado.');
  }
  function confirmAction(need:Need, kind:'activa'|'cerrada'|'cancelada'|'generate') {
    const label=kind==='generate'?'Generar invitaciones reales':kind==='activa'?'Activar necesidad':`Cambiar estado a ${kind}`;
    if(!window.confirm(`${label} para la necesidad ${need.needId.slice(0,8)}?`))return;
    if(kind==='generate') void action(`/api/v1/hospitals/me/needs/${need.needId}/invitations/generate`,'POST',undefined,'Generación solicitada al servidor. Consulta Invitaciones desde la cuenta de Donante.');
    else void action(`/api/v1/hospitals/me/needs/${need.needId}`,'PATCH',{status:kind},'Estado actualizado.');
  }
  return <div className="min-h-screen bg-background text-ink">
    <header className="border-b border-line bg-surface px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
      <div><strong className="text-xl">✚ Save a Life</strong><span className="ml-4 text-sm text-muted">Hospital · Administrador</span></div>
      <div className="flex items-center gap-3"><span className="text-sm text-muted">{hospitalName}</span><button className={secondary} onClick={()=>navigate('/ingresar')}>Cambiar cuenta</button></div>
    </header>
    <div className="mx-auto max-w-6xl p-6 md:p-10 space-y-7">
      <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-3xl font-bold">Gestión de necesidades</h1><p className="text-muted">Registra necesidades, actívalas y genera invitaciones reales para donantes.</p></div><button className={secondary} onClick={refresh} disabled={busy||loading}>Actualizar</button></div>
      {error && <div role="alert" className="rounded-lg border border-orange-800 p-4 text-orange-300">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-800 p-4 text-green-300">{notice}</div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-xl border border-line bg-surface p-6 space-y-5 self-start">
          <h2 className="text-xl font-semibold">Nueva necesidad</h2>
          <p className="text-sm text-muted">Solo puedes utilizar sedes autorizadas de tu hospital. La sangre declarada es para preselección académica.</p>
          <form onSubmit={create} className="space-y-4">
            <label className="block text-sm">Sede<select required className={field} value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Selecciona una sede</option>{sites.map(s=><option key={s.siteId} value={s.siteId}>{s.publicName}</option>)}</select></label>
            <label className="block text-sm">Grupo sanguíneo requerido<select className={field} value={blood} onChange={e=>setBlood(e.target.value as Blood)}>{bloods.map(b=><option key={b} value={b}>{bloodNames[b]}</option>)}</select></label>
            <label className="block text-sm">Urgencia<select className={field} value={urgency} onChange={e=>setUrgency(e.target.value)}><option>Normal</option><option>Urgente</option><option>Critica</option></select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Meta de confirmaciones<input className={field} type="number" min="1" max="50" step="1" value={target} onChange={e=>setTarget(Number(e.target.value))} required /></label>
              <label className="block text-sm">Radio (km)<input className={field} type="number" min="1" max="50" step="1" value={radius} onChange={e=>setRadius(Number(e.target.value))} required /></label>
            </div>
            <label className="block text-sm">Vigencia (horas)<input className={field} type="number" min="1" max="72" step="1" value={hours} onChange={e=>setHours(Number(e.target.value))} required /></label>
            <button type="submit" className={primary} disabled={busy||loading||!siteId}>{busy?'Procesando…':'Registrar necesidad'}</button>
            {!loading&&sites.length===0&&<p className="text-sm text-muted">No hay sedes autorizadas disponibles. Revisa las sedes desde Superadmin.</p>}
          </form>
        </section>
        <section className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <div className="flex justify-between items-center gap-2"><h2 className="text-xl font-semibold">Necesidades registradas</h2><span className="text-sm text-muted">{needs.length} cargadas</span></div>
          {loading?<p role="status">Consultando PostgreSQL…</p>:needs.length===0?<p className="text-muted">Todavía no existen necesidades de tu hospital.</p>:<div className="space-y-4">
            {needs.map(n=><article key={n.needId} className="rounded-lg border border-line p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{bloodNames[n.requiredBloodType]} · {n.urgency}</strong><span className="text-sm text-muted">Estado: {n.status}</span></div>
              <p className="text-sm text-muted">Meta: {n.targetConfirmations} · Confirmaciones: {n.confirmedIntentCount} · Radio: {n.radiusKm} km</p>
              <p className="text-xs text-muted">Vence: {new Date(n.expiresAt).toLocaleString('es-PE')}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {n.status==='borrador'&&<button className={primary} disabled={busy} onClick={()=>confirmAction(n,'activa')}>Activar</button>}
                {n.status==='activa'&&<button className={primary} disabled={busy} onClick={()=>confirmAction(n,'generate')}>Generar invitaciones</button>}
                {(['activa','meta_alcanzada'] as NeedStatus[]).includes(n.status)&&<button className={secondary} disabled={busy} onClick={()=>confirmAction(n,'cerrada')}>Cerrar</button>}
                {(['borrador','activa','meta_alcanzada'] as NeedStatus[]).includes(n.status)&&<button className={secondary} disabled={busy} onClick={()=>confirmAction(n,'cancelada')}>Cancelar</button>}
              </div>
            </article>)}
          </div>}
          {needs.length>=50&&<p className="text-xs text-muted">Se muestran hasta 50 registros. La paginación completa queda pendiente.</p>}
        </section>
      </div>
    </div>
  </div>;
}
''',encoding='utf-8')
print('Panel Hospital integrado en Safe-a-Life-login. Respaldo:',backup)
print('No se modificaron usuarios, backend ni datos de PostgreSQL.')
