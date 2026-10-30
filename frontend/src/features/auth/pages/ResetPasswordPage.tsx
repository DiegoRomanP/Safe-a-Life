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
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import {
  defaultTokenStatusCopy,
  TokenStatusView,
  type TokenStatus,
  type TokenStatusCopy,
} from '../components/TokenStatusView.js';
import { tokenStatusFor } from '../tokenStatus.js';
import { useFragmentToken } from '../useFragmentToken.js';
import { newPasswordError, PASSWORD_HINT } from '../validation.js';

// Para recuperación, el enlace vencido se renueva pidiendo otro, no al hospital,
// y las etiquetas concuerdan con «enlace».
const resetCopy: TokenStatusCopy = {
  ...defaultTokenStatusCopy,
  used: { ...defaultTokenStatusCopy.used, badge: 'Usado' },
  expired: {
    ...defaultTokenStatusCopy.expired,
    badge: 'Vencido',
    detail: 'Solicita un nuevo enlace de recuperación para continuar.',
  },
};

// AUTH-04 Completar recuperación (`/restablecer-contrasena#token`) con
// completePasswordReset. También es el segundo enlace del registro propio: fija la
// contraseña después de verificar el correo (barrera de sesión).
export function ResetPasswordPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');

  return (
    <AuthShell
      asideTitle="Recuperar acceso"
      asideDetail="El enlace se usa una sola vez y no se muestra en la dirección."
      asideFooter={
        <Alert tone="info" title="Privacidad del enlace">
          El token nunca se muestra en esta vista. No ingreses credenciales reales.
        </Alert>
      }
    >
      <div className="flex w-full max-w-[640px] flex-col items-center gap-6">
        {import.meta.env.DEV && <DevStatusPicker value={status} onChange={setStatus} />}
        <TokenStatusView status={status} copy={resetCopy} validContent={<NewPasswordForm token={token ?? ''} onLinkProblem={setStatus} />} />
      </div>
    </AuthShell>
  );
}

type Failure = 'limite' | 'red';

function NewPasswordForm({ token, onLinkProblem }: { token: string; onLinkProblem: (status: TokenStatus) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !token) return;
    const found = newPasswordError(password);
    flushSync(() => setError(found));
    if (found) return passwordRef.current?.focus();
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      await apiRequest('POST', `/auth/password-reset-actions/${encodeURIComponent(token)}`, { body: { newPassword: password } });
      setDone(true);
    } catch (caught) {
      const linkStatus = tokenStatusFor(caught);
      const status = caught instanceof ApiError ? caught.status : undefined;
      if (linkStatus) onLinkProblem(linkStatus);
      else if (status === 422) {
        // El backend consume el enlace antes de fijar la contraseña: puede hacer falta otro.
        flushSync(() => setError('Elige otra contraseña: esta no cumple los requisitos. Si el enlace ya no funciona, pide uno nuevo.'));
        passwordRef.current?.focus();
      } else setFailure(status === 429 ? 'limite' : 'red');
    } finally {
      inFlight.current = false;
      setPassword('');
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthCard labelledBy="restablecer-hecho">
        <Badge tone="success" className="self-start">
          Completado
        </Badge>
        <h1 id="restablecer-hecho" ref={doneRef} tabIndex={-1} className="text-3xl font-bold text-ink">
          Contraseña guardada
        </h1>
        <p className="text-muted">Ya puedes ingresar con tu correo y la contraseña nueva.</p>
        <div>
          <LinkButton to="/ingresar">Ingresar</LinkButton>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="restablecer-titulo">
      <Badge tone="success" className="self-start">
        Enlace válido
      </Badge>
      <h1 id="restablecer-titulo" className="text-3xl font-bold text-ink">
        Completar recuperación
      </h1>
      <div aria-live="polite">
        {failure && (
          <Alert tone="danger" title="No se pudo guardar">
            {failure === 'limite'
              ? 'Hiciste demasiados intentos. Espera unos minutos.'
              : 'Inténtalo de nuevo. Si el enlace ya no funciona, pide uno nuevo en «Recuperar acceso».'}
          </Alert>
        )}
      </div>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
        <Field label="Nueva contraseña" hint={PASSWORD_HINT} error={error}>
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
        <div>
          <Button type="submit" aria-disabled={pending} aria-busy={pending}>
            {pending ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
