import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import {
  defaultTokenStatusCopy,
  TokenStatusView,
  type TokenStatus,
  type TokenStatusCopy,
} from '../components/TokenStatusView.js';
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

// AUTH-04 Completar recuperación (`/restablecer-contrasena#token`). Sin backend
// (D-4) el estado depende de que haya un token con forma válida;
// completePasswordReset lo resuelve en el slice del cliente HTTP.
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
        <TokenStatusView status={status} copy={resetCopy} validContent={<NewPasswordForm />} />
      </div>
    </AuthShell>
  );
}

function NewPasswordForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = newPasswordError(password);
    flushSync(() => setError(found));
    if (found) return passwordRef.current?.focus();
    setPassword('');
    setAttempted(true);
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
        {attempted && (
          <Alert tone="info" title="Cambio aún no disponible">
            El cambio de contraseña real llega con la conexión al backend. Por ahora no se envían datos.
          </Alert>
        )}
      </div>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          <Button type="submit">Guardar contraseña</Button>
        </div>
      </form>
    </AuthCard>
  );
}
