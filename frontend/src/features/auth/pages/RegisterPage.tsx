import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { apiRequest } from '../../../lib/api/http.js';
import { ApiError } from '../../../lib/demoApi.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { StepList } from '../components/StepList.js';
import { registrationSteps } from '../registrationSteps.js';
import { emailError, newPasswordError, PASSWORD_HINT } from '../validation.js';

type Errors = { email?: string; password?: string };

// AUTH-02 Registro, paso 1 de 4 (Penpot «+»). createDonorRegistration solo
// recibe correo y contraseña y responde 202 neutral exista o no la cuenta; los
// pasos 2 a 4 son verificar el correo y el onboarding (DON-01).
export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'limite' | 'red'>();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const found: Errors = { email: emailError(email), password: newPasswordError(password) };
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      await apiRequest('POST', '/donor-registrations', { body: { email: email.trim(), password } });
      setSent(true);
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : undefined;
      if (status === 422) {
        flushSync(() => setErrors({ password: 'Revisa el correo y elige otra contraseña.' }));
        passwordRef.current?.focus();
      } else setFailure(status === 429 ? 'limite' : 'red');
    } finally {
      inFlight.current = false;
      setPassword('');
      setPending(false);
    }
  }

  return (
    <AuthShell
      asideTitle="Crea tu cuenta de donante"
      asideDetail="Completa tu perfil con datos sintéticos para participar en la demostración."
      asideContent={<StepList label="Pasos del registro" steps={registrationSteps} current={1} />}
    >
      {sent ? (
        <AuthCard labelledBy="registro-resultado" className="max-w-[640px]">
          <Badge tone="info" className="self-start">
            Solicitud recibida
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 id="registro-resultado" ref={resultRef} tabIndex={-1} className="text-3xl font-bold text-ink">
              Revisa tu correo
            </h1>
            <p className="text-muted">
              Si el correo puede registrarse, enviaremos un enlace de verificación. Revisa también la carpeta de
              correo no deseado.
            </p>
          </div>
          <Alert tone="brand" title="Prototipo académico">
            Usa solo correos sintéticos.
            {import.meta.env.DEV && ' En desarrollo los mensajes llegan al buzón local del equipo.'}
          </Alert>
          <div>
            <LinkButton to="/ingresar">Volver a ingresar</LinkButton>
          </div>
        </AuthCard>
      ) : (
        <AuthCard labelledBy="registro-titulo">
          <Badge tone="info" className="self-start">
            Paso 1 de 4
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 id="registro-titulo" className="text-3xl font-bold text-ink">
              Cuenta y correo
            </h1>
            <p className="text-muted">
              Registra una cuenta de demostración para recibir invitaciones de hospitales autorizados.
            </p>
          </div>
          <div aria-live="polite" className="live-slot">
            {failure && (
              <Alert tone="danger" title="No se pudo enviar el registro">
                {failure === 'limite' ? 'Hiciste demasiados intentos. Espera unos minutos.' : 'Inténtalo de nuevo en unos momentos.'}
              </Alert>
            )}
          </div>
          <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Correo electrónico" error={errors.email}>
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
              <Field label="Contraseña de demostración" hint={PASSWORD_HINT} error={errors.password}>
                {(control) => (
                  <Input
                    {...control}
                    ref={passwordRef}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Alert tone="brand" title="Uso exclusivamente académico">
              La cuenta solo se activará cuando el correo esté verificado y el perfil obligatorio esté completo.
            </Alert>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/" variant="ghost">
                Volver
              </LinkButton>
              <Button type="submit" aria-disabled={pending} aria-busy={pending}>
                {pending ? 'Enviando…' : 'Continuar'}
              </Button>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
