import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { StepList } from '../components/StepList.js';
import { emailError, newPasswordError, PASSWORD_HINT } from '../validation.js';
import { apiRequest, errorMessage } from '../../../api/client.js';

const steps = ['Cuenta y correo', 'Datos declarados', 'Disponibilidad', 'Revisión'];

type Errors = { email?: string; password?: string };

// AUTH-02 Registro, paso 1 de 4 (Penpot «+»). El contrato
// (createDonorRegistration) solo recibe correo y contraseña; los pasos 2 a 4
// son el onboarding (DON-01) tras verificar el correo. Sin backend (D-4) no se
// envía nada: se muestra el resultado neutral que daría la API (202).
export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState('');
  const submitting = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const found: Errors = { email: emailError(email), password: newPasswordError(password) };
    flushSync(() => setErrors(found));
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    submitting.current = true;
    setPending(true);
    setServerError('');
    try {
      await apiRequest('/api/v1/donor-registrations', {
        method: 'POST',
        body: { email: email.trim(), password },
        idempotencyKey: crypto.randomUUID(),
      });
      setPassword('');
      setSent(true);
    } catch (failure) {
      setServerError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <AuthShell
      asideTitle="Crea tu cuenta de donante"
      asideDetail="Regístrate para completar tu perfil y recibir invitaciones de hospitales autorizados."
      asideContent={<StepList label="Pasos del registro" steps={steps} current={1} />}
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
          <Alert tone="brand" title="Registro enviado">
            El servidor recibió la solicitud. La activación de la cuenta depende de completar la verificación de correo configurada en el entorno.
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
              Registra una cuenta para recibir invitaciones de hospitales autorizados.
            </p>
          </div>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Correo electrónico" error={errors.email}>
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
              <Field label="Contraseña" hint={PASSWORD_HINT} error={errors.password}>
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
            <div aria-live="polite" role="status">
              {pending && <p>Creando solicitud de registro…</p>}
              {serverError && <Alert tone="warning" title="No pudimos registrar la cuenta">{serverError}</Alert>}
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <LinkButton to="/" variant="ghost">
                Volver
              </LinkButton>
              <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Continuar"}</Button>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthShell>
  );
}
