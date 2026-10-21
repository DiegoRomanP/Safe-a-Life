import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import { TokenStatusView, type TokenStatus } from '../components/TokenStatusView.js';
import { useFragmentToken } from '../useFragmentToken.js';
import { newPasswordError, PASSWORD_HINT } from '../validation.js';

// AUTH-03 Reclamar cuenta asistida (`/activar-cuenta#token`, contenido de
// Penpot «SaL» con estilo «+»). Sin backend (D-4) el estado sale solo de si hay
// un token con forma válida; getAssistedActivationPreview lo reemplaza en el
// slice del cliente HTTP. Abrir la vista nunca consume el token.
export function ActivateAccountPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');
  const [step, setStep] = useState<'preview' | 'password'>('preview');

  return (
    <AuthShell
      asideTitle="Reclamar cuenta asistida"
      asideDetail="La dirección no muestra ni registra el valor del token."
      asideContent={
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Antes de continuar</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-white/85">
            <li>Usa un enlace enviado por el hospital autorizado.</li>
            <li>No compartas este enlace con otras personas.</li>
            <li>El prototipo no procesa enlaces reales.</li>
          </ul>
        </div>
      }
      asideFooter={
        <Alert tone="info" title="Privacidad del enlace">
          El token nunca se muestra en esta vista. No ingreses credenciales reales.
        </Alert>
      }
    >
      <div className="flex w-full max-w-[790px] flex-col items-center gap-6">
        {import.meta.env.DEV && (
          <DevStatusPicker
            value={status}
            onChange={(next) => {
              setStatus(next);
              setStep('preview');
            }}
          />
        )}
        <TokenStatusView
          status={status}
          validContent={step === 'preview' ? <ValidInvitation onContinue={() => setStep('password')} /> : <ClaimPassword />}
        />
      </div>
    </AuthShell>
  );
}

function ValidInvitation({ onContinue }: { onContinue: () => void }) {
  return (
    <AuthCard labelledBy="activar-titulo">
      <Badge tone="success" className="self-start">
        Invitación válida
      </Badge>
      <div className="flex flex-col gap-2">
        <h1 id="activar-titulo" className="text-3xl font-bold text-ink">
          Puedes reclamar la cuenta asistida
        </h1>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>Solo ahora crearás tu contraseña y completarás tu perfil.</li>
          <li>El enlace se usa una sola vez; el token no se muestra.</li>
        </ul>
      </div>
      <div>
        <Button onClick={onContinue}>Continuar y crear contraseña</Button>
      </div>
    </AuthCard>
  );
}

function ClaimPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = newPasswordError(password);
    flushSync(() => setError(found));
    if (found) return passwordRef.current?.focus();
    setPassword('');
    setAttempted(true);
  }

  return (
    <AuthCard labelledBy="activar-contrasena-titulo" className="max-w-[640px]">
      <h1 id="activar-contrasena-titulo" ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-ink">
        Crea tu contraseña
      </h1>
      <div aria-live="polite">
        {attempted && (
          <Alert tone="info" title="Activación aún no disponible">
            La activación real llega con la conexión al backend. Por ahora no se envían datos.
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
          <Button type="submit">Activar cuenta</Button>
        </div>
      </form>
    </AuthCard>
  );
}
