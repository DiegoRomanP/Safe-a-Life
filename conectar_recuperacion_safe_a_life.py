from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
client = root / 'frontend/src/api/client.ts'
recover = root / 'frontend/src/features/auth/pages/RecoverAccessPage.tsx'
reset = root / 'frontend/src/features/auth/pages/ResetPasswordPage.tsx'
for p in (client, recover, reset):
    if not p.is_file():
        raise SystemExit(f'ERROR: Falta {p}. Ejecuta desde la raíz del proyecto.')

before = client.read_text(encoding='utf-8')
old = "if (write && !(options.method === 'POST' && (path === '/api/v1/auth/sessions' || path === '/api/v1/donor-registrations'))) {"
new = """const publicPost = options.method === 'POST' && (
    path === '/api/v1/auth/sessions' ||
    path === '/api/v1/donor-registrations' ||
    path === '/api/v1/auth/password-recovery-requests' ||
    /^\\/api\\/v1\\/auth\\/password-reset-actions\\/[A-Za-z0-9_-]+$/.test(path) ||
    /^\\/api\\/v1\\/donor-email-verification-actions\\/[A-Za-z0-9_-]+$/.test(path)
  );
  if (write && !publicPost) {"""
# Support earlier manually applied CSRF changes, preserving unrelated rules.
if old in before:
    updated = before.replace(old, new, 1)
else:
    if 'if (write && !publicPost)' in before:
        # Mantiene intacta la lista pública existente y añade solo las dos rutas de recuperación.
        addition = """const publicRecoveryPost = options.method === 'POST' && (
    path === '/api/v1/auth/password-recovery-requests' ||
    /^\/api\/v1\/auth\/password-reset-actions\/[A-Za-z0-9_-]+$/.test(path)
  );
  if (write && !publicPost && !publicRecoveryPost) {"""
        updated = before.replace('if (write && !publicPost) {', addition, 1)
    else:
        raise SystemExit('ERROR: El cliente HTTP difiere de la versión auditada. No se cambió ningún archivo.')

recover_content = r'''import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, createMutationIntent, errorMessage } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { emailError } from '../validation.js';

export function RecoverAccessPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [requestError, setRequestError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const intent = useRef(createMutationIntent());
  const emailRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = emailError(email);
    setError(found);
    if (found) { emailRef.current?.focus(); return; }
    setBusy(true);
    setRequestError('');
    const path = '/api/v1/auth/password-recovery-requests';
    const body = { email: email.trim() };
    try {
      await apiRequest(path, { method: 'POST', body, idempotencyKey: intent.current.keyFor(path, body) });
      intent.current.reset();
      setEmail('');
      setSent(true);
    } catch (cause) {
      setRequestError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      asideTitle="Recuperar acceso"
      asideDetail="El resultado es neutral para no revelar si una cuenta existe."
      asideFooter={<Alert tone="info" title="Privacidad de la cuenta">Si corresponde, se enviarán instrucciones. Revisa también la carpeta de correo no deseado.</Alert>}
    >
      {sent ? (
        <AuthCard labelledBy="recuperar-resultado" className="max-w-[640px]">
          <Badge tone="info" className="self-start">Solicitud procesada</Badge>
          <h1 id="recuperar-resultado" ref={resultRef} tabIndex={-1} className="text-3xl font-bold text-ink">
            Si corresponde, enviaremos instrucciones
          </h1>
          <p className="text-muted">Revisa tu correo o, en el entorno local, el buzón de desarrollo.</p>
          <p className="text-muted">No confirmamos si una cuenta existe.</p>
          <LinkButton to="/ingresar">Volver a ingresar</LinkButton>
        </AuthCard>
      ) : (
        <AuthCard labelledBy="recuperar-titulo" className="max-w-[650px]">
          <h1 id="recuperar-titulo" className="text-3xl font-bold text-ink">Solicitar enlace de recuperación</h1>
          {requestError && <Alert tone="warning" title="No se pudo enviar la solicitud">{requestError}</Alert>}
          <form noValidate onSubmit={(event) => { void handleSubmit(event); }} className="flex flex-col gap-6">
            <Field label="Correo electrónico" hint="El mensaje será el mismo para todos los casos." error={error}>
              {(control) => <Input {...control} ref={emailRef} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
            </Field>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/ingresar" variant="ghost">Volver a ingresar</LinkButton>
              <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</Button>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
'''
reset_content = r'''import { useRef, useState, type FormEvent } from 'react';
import { apiRequest, ApiError, createMutationIntent, errorMessage } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { useFragmentToken } from '../useFragmentToken.js';
import { newPasswordError, PASSWORD_HINT } from '../validation.js';

export function ResetPasswordPage() {
  const { token, malformed } = useFragmentToken();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const intent = useRef(createMutationIntent());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy || done) return;
    const found = newPasswordError(password);
    setError(found);
    if (found) { passwordRef.current?.focus(); return; }
    setBusy(true);
    setMessage('');
    const path = `/api/v1/auth/password-reset-actions/${encodeURIComponent(token)}`;
    const body = { newPassword: password };
    try {
      await apiRequest(path, { method: 'POST', body, idempotencyKey: intent.current.keyFor(path, body) });
      intent.current.reset();
      setPassword('');
      setDone(true);
    } catch (cause) {
      if (cause instanceof ApiError && [404, 410].includes(cause.status)) {
        setInvalid(true);
      } else {
        setMessage(errorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell asideTitle="Recuperar acceso" asideDetail="El enlace es de un solo uso y no se muestra en la dirección.">
      <AuthCard labelledBy="restablecer-titulo" className="max-w-[640px]">
        <h1 id="restablecer-titulo" className="text-3xl font-bold text-ink">
          {done ? 'Contraseña actualizada' : 'Completar recuperación'}
        </h1>
        {done ? (
          <>
            <Alert tone="info" title="Cambio confirmado">Inicia sesión con tu contraseña nueva para completar tu perfil.</Alert>
            <LinkButton to="/ingresar">Ir a iniciar sesión</LinkButton>
          </>
        ) : (!token || malformed || invalid) ? (
          <>
            <Alert tone="warning" title="Enlace no disponible">El enlace no está disponible, venció o ya fue utilizado. Solicita uno nuevo.</Alert>
            <LinkButton to="/recuperar-acceso">Solicitar otro enlace</LinkButton>
          </>
        ) : (
          <>
            {message && <Alert tone="warning" title="No se pudo cambiar la contraseña">{message}</Alert>}
            <form noValidate onSubmit={(event) => { void handleSubmit(event); }} className="flex flex-col gap-6">
              <Field label="Nueva contraseña" hint={PASSWORD_HINT} error={error}>
                {(control) => <Input {...control} ref={passwordRef} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
              </Field>
              <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</Button>
            </form>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
'''

backup = root / ('respaldo_recuperacion_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir()
for p in (client, recover, reset):
    shutil.copy2(p, backup / p.name)
client.write_text(updated, encoding='utf-8')
recover.write_text(recover_content, encoding='utf-8')
reset.write_text(reset_content, encoding='utf-8')
print('Recuperación de contraseña conectada a la API real.')
print('Respaldo:', backup)
print('No se modificó la base de datos ni se cambiaron credenciales.')
