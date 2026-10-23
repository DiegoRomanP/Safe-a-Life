from pathlib import Path
import shutil, sys
root=Path.cwd()
routes=root/'frontend/src/app/routes.tsx'
page=root/'frontend/src/features/auth/pages/VerifyEmailPage.tsx'
client=root/'frontend/src/api/client.ts'
if not all(p.exists() for p in (routes,client)):
    sys.exit('Ejecuta el script desde la raiz Safe-a-Life-login. No se modifico nada.')
r=routes.read_text(encoding='utf-8')
c=client.read_text(encoding='utf-8')
if 'VerifyEmailPage' in r or page.exists():
    sys.exit('La pagina de verificacion ya existe. No se modifico nada para evitar duplicados.')
if "{ path: 'registro', element: <RegisterPage /> }," not in r:
    sys.exit('No encuentro el punto de insercion esperado en routes.tsx. Sin cambios.')
if 'export async function apiRequest' not in c:
    sys.exit('No existe apiRequest en client.ts. Sin cambios.')
source='''import { useEffect, useRef, useState } from 'react';
import { apiRequest, errorMessage, ApiError } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';

type Status = 'checking' | 'ready' | 'invalid' | 'submitting' | 'done' | 'error';

/** Enlaces de un solo uso: consultar no consume; confirmar sí. Nunca mostrar el secreto. */
export function VerifyEmailPage() {
  const tokenRef = useRef<string>(window.location.hash.slice(1));
  const intentRef = useRef<string>(crypto.randomUUID());
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Eliminar el fragmento del historial visible tan pronto como se capture.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    const token = tokenRef.current;
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    void apiRequest(`/api/v1/donor-email-verification-actions/${encodeURIComponent(token)}`)
      .then(() => { if (!cancelled) setStatus('ready'); })
      .catch(() => { if (!cancelled) setStatus('invalid'); });
    return () => { cancelled = true; };
  }, []);

  async function confirm() {
    if (status !== 'ready' && status !== 'error') return;
    const token = tokenRef.current;
    setStatus('submitting');
    setMessage('');
    try {
      await apiRequest(`/api/v1/donor-email-verification-actions/${encodeURIComponent(token)}`, {
        method: 'POST', idempotencyKey: intentRef.current,
      });
      tokenRef.current = '';
      setStatus('done');
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 404, 409, 410].includes(error.status)) {
        setStatus('invalid');
      } else {
        setStatus('error');
        setMessage(errorMessage(error));
      }
    }
  }

  return <AuthShell asideTitle="Verificación de correo" asideDetail="Confirma tu correo para completar el perfil de donante.">
    <AuthCard labelledBy="verificacion-correo-titulo" className="max-w-[640px]">
      <h1 id="verificacion-correo-titulo" className="text-3xl font-bold text-ink">Verifica tu correo</h1>
      <div aria-live="polite">
        {status === 'checking' && <p role="status" className="text-muted">Comprobando enlace…</p>}
        {status === 'ready' && <Alert tone="info" title="Enlace disponible">Confirma que deseas verificar este correo.</Alert>}
        {status === 'submitting' && <p role="status" className="text-muted">Confirmando correo…</p>}
        {status === 'done' && <Alert tone="info" title="Correo verificado">Tu correo quedó verificado. Ya puedes iniciar sesión y completar tu perfil.</Alert>}
        {status === 'invalid' && <Alert tone="warning" title="Enlace no disponible">El enlace es inválido, venció o ya fue utilizado. Solicita uno nuevo si corresponde.</Alert>}
        {status === 'error' && <Alert tone="warning" title="No se pudo confirmar">{message}</Alert>}
      </div>
      {(status === 'ready' || status === 'error') && <Button onClick={() => { void confirm(); }}>Confirmar correo</Button>}
      <LinkButton to="/ingresar" variant="secondary">Ir a iniciar sesión</LinkButton>
    </AuthCard>
  </AuthShell>;
}
'''
# backups before writing
shutil.copy2(routes, routes.with_suffix('.tsx.backup-verificacion'))
r=r.replace("import { VerifyIdentityPage } from '../features/auth/pages/VerifyIdentityPage.js';", "import { VerifyIdentityPage } from '../features/auth/pages/VerifyIdentityPage.js';\nimport { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage.js';")
r=r.replace("{ path: 'registro', element: <RegisterPage /> },", "{ path: 'registro', element: <RegisterPage /> },\n  { path: 'verificar-correo', element: <VerifyEmailPage /> },")
routes.write_text(r,encoding='utf-8')
page.write_text(source,encoding='utf-8')
print('OK: ruta y pagina real de verificacion creadas.')
print('Respaldo: frontend/src/app/routes.tsx.backup-verificacion')
print('Ejecuta: npm run typecheck --workspace @save-a-life/frontend')
