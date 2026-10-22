import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
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

// Vista previa sintética de getHospitalAdminInvitationPreview mientras no hay
// cliente HTTP (D-4).
const demoPreview = { hospitalName: 'Hospital Nacional Central', expiresAt: '2026-09-25T15:00:00Z' };

// Una invitación de administrador vencida se renueva con el superadmin.
const adminCopy: TokenStatusCopy = {
  ...defaultTokenStatusCopy,
  used: { ...defaultTokenStatusCopy.used, badge: 'Usada' },
  expired: {
    ...defaultTokenStatusCopy.expired,
    detail: 'Pide a la administración central una nueva invitación para continuar.',
  },
};

// Invitación de administrador de hospital (`/invitacion-administrador#token`,
// enlace del correo del backend). Abrir la vista solo muestra la vista previa
// (hospital, rol y plazo) y nunca consume el token. Reclamar crea la contraseña
// (claimHospitalAdminInvitation, 12 a 128 caracteres); el hospital y el rol
// salen de la invitación protegida y la cuenta debe configurar MFA antes de
// operar. Sin backend (D-4).
export function AdminInvitationPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');

  return (
    <AuthShell
      asideTitle="Acceso administrativo"
      asideDetail="Activa tu cuenta para coordinar necesidades de tu hospital."
      asideFooter={
        <Alert tone="info" title="Privacidad del enlace">
          El token nunca se muestra en esta vista. No ingreses credenciales reales.
        </Alert>
      }
    >
      <div className="flex w-full max-w-[640px] flex-col items-center gap-6">
        {import.meta.env.DEV && <DevStatusPicker value={status} onChange={setStatus} />}
        <TokenStatusView status={status} copy={adminCopy} validContent={<ClaimAdminInvitation />} />
      </div>
    </AuthShell>
  );
}

function ClaimAdminInvitation() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = newPasswordError(password);
    flushSync(() => setError(found));
    if (found) return passwordRef.current?.focus();
    setPassword('');
    setDone(true);
  }

  if (done) {
    return (
      <AuthCard labelledBy="admin-hecho" className="max-w-[640px]">
        <Badge tone="success" className="self-start">
          Cuenta creada
        </Badge>
        <div className="flex flex-col gap-2">
          <h1 id="admin-hecho" ref={doneRef} tabIndex={-1} className="text-3xl font-bold text-ink">
            Configura tu verificación en dos pasos
          </h1>
          <p className="text-muted">Antes de operar como administrador debes confirmar tu segundo factor (MFA).</p>
        </div>
        <Alert tone="brand" title="Prototipo académico">
          Esta pantalla no crea cuentas reales.
        </Alert>
        <div>
          <LinkButton to="/verificar-identidad">Continuar a la verificación</LinkButton>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="admin-titulo" className="max-w-[640px]">
      <Badge tone="success" className="self-start">
        Invitación válida
      </Badge>
      <div className="flex flex-col gap-2">
        <h1 id="admin-titulo" className="text-3xl font-bold text-ink">
          Activa tu acceso de administrador
        </h1>
        <p className="text-muted">Crea tu contraseña para administrar la cuenta del hospital.</p>
      </div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="text-sm font-semibold text-muted">Hospital</dt>
        <dd className="text-ink">{demoPreview.hospitalName}</dd>
        <dt className="text-sm font-semibold text-muted">Rol</dt>
        <dd className="text-ink">Administrador de hospital</dd>
        <dt className="text-sm font-semibold text-muted">Vence</dt>
        <dd className="text-ink">{formatDateTime(demoPreview.expiresAt)}</dd>
      </dl>
      <Alert tone="info" title="Abrir el enlace no cambia nada">
        La cuenta solo se crea al guardar la contraseña. El enlace se usa una sola vez.
      </Alert>
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
          <Button type="submit">Crear contraseña y continuar</Button>
        </div>
      </form>
    </AuthCard>
  );
}
