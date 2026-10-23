import { useRef, useState, type FormEvent } from 'react';
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
