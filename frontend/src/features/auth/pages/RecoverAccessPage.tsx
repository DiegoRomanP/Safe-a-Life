import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { requestPasswordRecovery } from '../../../lib/api/auth.js';
import { emailError } from '../validation.js';

// AUTH-04 Recuperar acceso (contenido de Penpot «SaL» con estilo «+»). El
// resultado es siempre el mismo, exista o no la cuenta, igual que el 202 de
// requestPasswordRecovery.
export function RecoverAccessPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = emailError(email);
    flushSync(() => setError(found));
    if (found) return emailRef.current?.focus();
    setBusy(true);
    setFailed(false);
    try {
      await requestPasswordRecovery(email.trim());
      setEmail('');
      setSent(true);
    } catch {
      // Solo un fallo real (red, límite, 5xx) llega aquí: el 202 es el mismo exista o no la cuenta.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      asideTitle="Recuperar acceso"
      asideDetail="El resultado es neutral para no revelar si una cuenta existe."
      asideFooter={
        <Alert tone="info" title="Privacidad de la cuenta">
          Si corresponde, se enviarán instrucciones. Revisa también la carpeta de correo no deseado.
        </Alert>
      }
    >
      {sent ? (
        <AuthCard labelledBy="recuperar-resultado" className="max-w-[640px]">
          <Badge tone="info" className="self-start">
            Solicitud procesada
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 id="recuperar-resultado" ref={resultRef} tabIndex={-1} className="text-3xl font-bold text-ink">
              Si corresponde, enviaremos instrucciones
            </h1>
            <p className="text-muted">Revisa tu correo y la carpeta de correo no deseado.</p>
            <p className="text-muted">No confirmamos si una cuenta existe. Puedes volver a ingresar.</p>
          </div>
          <Alert tone="brand" title="Prototipo académico">
            No uses datos reales en este prototipo.
          </Alert>
          <div>
            <LinkButton to="/ingresar">Volver a ingresar</LinkButton>
          </div>
        </AuthCard>
      ) : (
        <AuthCard labelledBy="recuperar-titulo" className="max-w-[650px]">
          <h1 id="recuperar-titulo" className="text-3xl font-bold text-ink">
            Solicitar enlace de recuperación
          </h1>
          <div aria-live="polite">
            {failed && (
              <Alert tone="danger" title="No pudimos enviar la solicitud">
                Intenta de nuevo en unos minutos.
              </Alert>
            )}
          </div>
          <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
            <Field
              label="Correo electrónico"
              hint="Usa una dirección de correo. El mensaje será igual para todos los casos."
              error={error}
            >
              {(control) => (
                <Input
                  {...control}
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@example.test"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/ingresar" variant="ghost">
                Volver a ingresar
              </LinkButton>
              <Button type="submit" aria-disabled={busy} aria-busy={busy}>Enviar solicitud</Button>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
