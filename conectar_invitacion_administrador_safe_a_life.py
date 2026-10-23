from pathlib import Path
from datetime import datetime
import shutil

root=Path.cwd()
routes=root/'frontend/src/app/routes.tsx'
client=root/'frontend/src/api/client.ts'
page=root/'frontend/src/features/auth/pages/ClaimHospitalAdminPage.tsx'
if not (routes.exists() and client.exists()):
    raise SystemExit('Ejecuta este script en la raíz de Safe-a-Life-login.')
r=routes.read_text(encoding='utf-8')
c=client.read_text(encoding='utf-8')
if 'ClaimHospitalAdminPage' in r or "path: 'invitacion-administrador'" in r:
    raise SystemExit('La ruta ya está integrada; no se duplicaron cambios.')
needle="  { path: 'activar-cuenta', element: <ActivateAccountPage /> },"
if r.count(needle)!=1: raise SystemExit('Estructura de routes.tsx desconocida; no se modificó nada.')
needle2="    /^\\/api\\/v1\\/auth\\/password-reset-actions\\/[A-Za-z0-9_-]+$/.test(path)"
if needle2 not in c:
    # simply match actual text as seen in zip
    needle2=r"    /^\/api\/v1\/auth\/password-reset-actions\/[A-Za-z0-9_-]+$/.test(path)"
if c.count(needle2)!=1: raise SystemExit('No se encontró la excepción CSRF del cliente; no se modificó nada.')
page_content=r'''import { useRef, useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest, createMutationIntent, errorMessage } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { useFragmentToken } from '../useFragmentToken.js';
import { newPasswordError, PASSWORD_HINT } from '../validation.js';

type Preview = { hospitalName: string; role: string; expiresAt: string };
type Status = 'checking' | 'ready' | 'unavailable' | 'error' | 'sending' | 'done';

export function ClaimHospitalAdminPage() {
  const { token, malformed } = useFragmentToken();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [validation, setValidation] = useState('');
  const [message, setMessage] = useState('');
  const intent = useRef(createMutationIntent());

  useEffect(() => {
    if (!token || malformed) { setStatus('unavailable'); return; }
    let cancelled = false;
    void apiRequest<Preview>(`/api/v1/hospital-admin-invitation-actions/${encodeURIComponent(token)}`)
      .then((data) => { if (!cancelled) { setPreview(data); setStatus('ready'); } })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(error instanceof ApiError && [400, 404, 410].includes(error.status) ? 'unavailable' : 'error');
        setMessage(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [token, malformed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || status !== 'ready') return;
    const problem = newPasswordError(password);
    if (problem) { setValidation(problem); return; }
    if (password !== confirm) { setValidation('Las contraseñas no coinciden.'); return; }
    setValidation(''); setMessage(''); setStatus('sending');
    const path = `/api/v1/hospital-admin-invitation-actions/${encodeURIComponent(token)}/claim`;
    const body = { password };
    try {
      await apiRequest(path, { method: 'POST', body, idempotencyKey: intent.current.keyFor(path, body) });
      intent.current.reset(); setPassword(''); setConfirm(''); setStatus('done');
    } catch (error) {
      if (error instanceof ApiError && [404, 410].includes(error.status)) setStatus('unavailable');
      else { setMessage(errorMessage(error)); setStatus('ready'); }
    }
  }

  return <AuthShell asideTitle="Acceso hospitalario" asideDetail="Activa tu invitación para administrar el hospital autorizado.">
    <AuthCard labelledBy="reclamar-admin-titulo" className="max-w-[640px]">
      <h1 id="reclamar-admin-titulo" className="text-3xl font-bold text-ink">Activar cuenta hospitalaria</h1>
      {status === 'checking' && <p role="status">Comprobando invitación…</p>}
      {status === 'unavailable' && <Alert tone="warning" title="Invitación no disponible">El enlace venció, fue utilizado o no es válido. Solicita una nueva invitación al Superadmin.</Alert>}
      {status === 'error' && <Alert tone="warning" title="No pudimos comprobar la invitación">{message}</Alert>}
      {status === 'done' && <>
        <Alert tone="info" title="Cuenta activada">La cuenta hospitalaria se activó. Ya puedes ingresar con la contraseña configurada.</Alert>
        <Button onClick={() => navigate('/ingresar', { replace: true })}>Continuar al inicio de sesión</Button>
      </>}
      {(status === 'ready' || status === 'sending') && <>
        {preview && <Alert tone="info" title="Invitación válida">Hospital autorizado: {preview.hospitalName}.</Alert>}
        {message && <Alert tone="warning" title="No se pudo activar">{message}</Alert>}
        <form noValidate onSubmit={(event) => { void submit(event); }} className="flex flex-col gap-5">
          <Field label="Nueva contraseña" hint={PASSWORD_HINT} error={validation || undefined}>
            {(control) => <Input {...control} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={status === 'sending'} />}
          </Field>
          <Field label="Confirmar contraseña">
            {(control) => <Input {...control} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={status === 'sending'} />}
          </Field>
          <Button type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Activando…' : 'Activar cuenta'}</Button>
        </form>
      </>}
      {status !== 'done' && <LinkButton to="/ingresar" variant="secondary">Volver a ingresar</LinkButton>}
    </AuthCard>
  </AuthShell>;
}
'''
backup=root/('respaldo_invitacion_admin_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir()
for f in [routes,client]:
 target=backup/f.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
r=r.replace("import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage.js';", "import { ActivateAccountPage } from '../features/auth/pages/ActivateAccountPage.js';\nimport { ClaimHospitalAdminPage } from '../features/auth/pages/ClaimHospitalAdminPage.js';")
r=r.replace(needle,needle+"\n  { path: 'invitacion-administrador', element: <ClaimHospitalAdminPage /> },")
c=c.replace(needle2,needle2+" ||\n    /^\\/api\\/v1\\/hospital-admin-invitation-actions\\/[A-Za-z0-9_-]+\\/claim$/.test(path)")
# remove superfluous escaping from new regex (string literal needs / delimiter escapes, not double escapes)
c=c.replace(r'/^\\/api\\/v1\\/hospital-admin-invitation-actions\\/[A-Za-z0-9_-]+\\/claim$/.test(path)',r'/^\/api\/v1\/hospital-admin-invitation-actions\/[A-Za-z0-9_-]+\/claim$/.test(path)')
routes.write_text(r,encoding='utf-8')
client.write_text(c,encoding='utf-8')
page.parent.mkdir(parents=True,exist_ok=True)
page.write_text(page_content,encoding='utf-8')
print('Página, ruta y petición pública de activación integradas.')
print('Respaldo:', backup)
print('Comprueba: npm run typecheck --workspace @save-a-life/frontend')
