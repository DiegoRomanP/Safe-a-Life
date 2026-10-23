from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
page = root / 'frontend/src/features/donor/pages/ProfilePage.tsx'
client = root / 'frontend/src/api/client.ts'
if not page.exists() or not client.exists():
    raise SystemExit('Ejecuta este script desde la raiz de Safe-a-Life-login.')
original = page.read_text(encoding='utf-8')
if "useDonorDemo" not in original and 'apiRequest' in original:
    raise SystemExit('La pantalla ya parece integrada. No se sobrescribio.')
if 'useDonorDemo' not in original:
    raise SystemExit('El archivo difiere de la version auditada. No se modifico.')
oldclient = client.read_text(encoding='utf-8')
if "method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';" not in oldclient and "method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';" not in oldclient:
    raise SystemExit('Contrato HTTP inesperado, no se modifico.')
backup = root / ('respaldo_perfil_real_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir()
shutil.copy2(page, backup / 'ProfilePage.tsx')
shutil.copy2(client, backup / 'client.ts')
newclient = oldclient.replace("method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';", "method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';")
code = '''import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, ApiError, createMutationIntent, errorMessage } from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { bloodTypeLabel, type BloodType } from '../../../lib/format.js';
import type { DonorProfile } from '../types.js';

type PageState = 'loading' | 'onboarding' | 'active' | 'loading-error';
const bloodTypes: BloodType[] = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'];
const coord = /^-?\\d{1,3}(\\.\\d{1,3})?$/;
const newIntent = createMutationIntent;

function readLocation(latitude: string, longitude: string) {
  if (!coord.test(latitude.trim()) || !coord.test(longitude.trim())) {
    throw new Error('Escribe latitud y longitud con un máximo de tres decimales.');
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Coordenadas fuera de rango.');
  return { latitude: lat, longitude: lon };
}

/** Perfil real: 404 indica que aún no hay un perfil activo, no que deba mostrarse una cuenta ficticia. */
export function ProfilePage() {
  const [mode, setMode] = useState<PageState>('loading');
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [name, setName] = useState('');
  const [blood, setBlood] = useState<BloodType>('O_POS');
  const [available, setAvailable] = useState(true);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const intent = useRef(newIntent());

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DonorProfile>('/api/v1/donors/me/profile', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setProfile(data);
        setName(data.name);
        setBlood(data.declaredBloodType);
        setAvailable(data.isAvailable);
        setLatitude(String(data.approximateLocation.latitude));
        setLongitude(String(data.approximateLocation.longitude));
        setMode('active');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) setMode('onboarding');
        else { setMode('loading-error'); setMessage(errorMessage(error)); }
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSaved(false);
    setMessage('');
    try {
      const approximateLocation = readLocation(latitude, longitude);
      const creating = mode === 'onboarding';
      if (creating && name.trim().length < 2) throw new Error('Ingresa tu nombre completo.');
      const path = creating ? '/api/v1/donors/me/onboarding-profile' : '/api/v1/donors/me/profile';
      const body = creating
        ? { name: name.trim(), declaredBloodType: blood, isAvailable: available, approximateLocation }
        : { isAvailable: available, approximateLocation };
      setBusy(true);
      const data = await apiRequest<DonorProfile>(path, {
        method: creating ? 'PUT' : 'PATCH', body, idempotencyKey: intent.current.keyFor(path, body),
      });
      intent.current.reset();
      setProfile(data);
      setName(data.name);
      setBlood(data.declaredBloodType);
      setAvailable(data.isAvailable);
      setLatitude(String(data.approximateLocation.latitude));
      setLongitude(String(data.approximateLocation.longitude));
      setMode('active');
      setSaved(true);
    } catch (error) {
      if (error instanceof Error && !(error instanceof ApiError)) setMessage(error.message);
      else if (error instanceof ApiError && error.status === 409 && mode === 'onboarding') {
        setMessage('Tu correo ya puede estar verificado, pero el servidor todavía exige finalizar la configuración de contraseña antes de activar el perfil. No es posible omitirla desde esta pantalla.');
      } else setMessage(errorMessage(error));
    } finally { setBusy(false); }
  }

  if (mode === 'loading') return <PageHeader title="Mi perfil" description="Cargando información de tu cuenta…" />;
  if (mode === 'loading-error') return <>
    <PageHeader title="Mi perfil" description="No pudimos consultar tu perfil real." />
    <Alert tone="warning" title="No fue posible cargar los datos">{message}</Alert>
    <Button onClick={() => window.location.reload()}>Reintentar</Button>
  </>;

  const creating = mode === 'onboarding';
  return <>
    <PageHeader
      title={creating ? 'Completar perfil de donante' : 'Mi perfil'}
      description={creating ? 'Configura tus datos iniciales para activar la participación.' : 'Actualiza tu disponibilidad y ubicación aproximada.'}
      actions={<Button type="submit" form="perfil-real" disabled={busy}>{busy ? 'Guardando…' : creating ? 'Completar perfil' : 'Guardar cambios'}</Button>}
    />
    {creating ? <Alert tone="info" title="Perfil todavía incompleto">
      La información inicial se guardará en PostgreSQL. El servidor también comprobará que hayas terminado los pasos de seguridad de tu cuenta.
    </Alert> : <Alert tone="brand" title="Datos protegidos">
      Después de activar el perfil, el nombre y el grupo sanguíneo no se modifican directamente; requieren una solicitud de corrección.
    </Alert>}
    <div aria-live="polite">
      {message && <Alert tone="warning" title="No se pudieron guardar los datos">{message}</Alert>}
      {saved && <SuccessNotice announce={false} message="Cambios guardados" detail="Información confirmada por el servidor." />}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="Datos del donante">
        <form id="perfil-real" onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Nombre">
              {(control) => <Input {...control} value={name} readOnly={!creating} required={creating} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Correo">
              {(control) => <Input {...control} type="email" readOnly value={profile?.email ?? 'Se conserva el correo de tu cuenta'} />}
            </Field>
            <Field label="Grupo sanguíneo declarado">
              {(control) => creating
                ? <select {...control} className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-ink" value={blood} onChange={(e) => setBlood(e.target.value as BloodType)}>
                    {bloodTypes.map((item) => <option key={item} value={item}>{bloodTypeLabel(item)}</option>)}
                  </select>
                : <Input {...control} readOnly value={bloodTypeLabel(blood)} />}
            </Field>
          </div>
          <p className="text-sm text-muted">Ubicación sintética aproximada: máximo tres decimales; no uses tu domicilio real.</p>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Latitud">
              {(control) => <Input {...control} inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} required />}
            </Field>
            <Field label="Longitud">
              {(control) => <Input {...control} inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} required />}
            </Field>
          </div>
          <label className="flex items-center gap-3 text-ink">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Disponible para recibir invitaciones
          </label>
        </form>
      </Card>
      <Card title="Cambios protegidos">
        <p className="text-muted">Para corregir el nombre, el grupo sanguíneo o el correo de un perfil activo, utiliza el flujo de solicitudes.</p>
        <LinkButton to="/donante/solicitudes" variant="secondary">Ver mis solicitudes</LinkButton>
      </Card>
    </div>
  </>;
}
'''
page.write_text(code, encoding='utf-8')
client.write_text(newclient, encoding='utf-8')
print('Integracion de perfil aplicada. Copias:',backup)
print('Ejecuta: npm run typecheck --workspace @save-a-life/frontend')
