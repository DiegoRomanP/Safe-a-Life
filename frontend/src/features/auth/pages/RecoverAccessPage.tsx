import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { emailError } from '../validation.js';

// AUTH-04 Recuperar acceso (contenido de Penpot «SaL» con estilo «+»). El
// resultado es siempre el mismo, exista o no la cuenta, igual que el 202 de
// requestPasswordRecovery. Sin backend (D-4) no se envía nada.
export function RecoverAccessPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = emailError(email);
    flushSync(() => setError(found));
    if (found) return emailRef.current?.focus();
    setEmail('');
    setSent(true);
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
            Esta pantalla no envía mensajes ni procesa cuentas reales.
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
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
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
                  placeholder="nombre@ejemplo.test"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/ingresar" variant="ghost">
                Volver a ingresar
              </LinkButton>
              <Button type="submit">Enviar solicitud</Button>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
