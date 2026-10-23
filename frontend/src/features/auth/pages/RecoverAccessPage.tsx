import { useEffect, useRef, useState, type FormEvent } from 'react';
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
