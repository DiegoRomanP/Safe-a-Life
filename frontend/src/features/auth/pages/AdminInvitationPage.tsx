import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { Loading } from '../../../components/states/Loading.js';
import { claimAdminInvitation, fetchAdminInvitationPreview, fetchCsrfToken, type AdminInvitationPreview } from '../../../lib/api/auth.js';
import { PasswordClaimForm } from '../components/PasswordClaimForm.js';
import { setAuthSession } from '../session/session.js';
import { tokenStatusFor } from '../tokenStatus.js';
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
// operar.
export function AdminInvitationPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');
  const [preview, setPreview] = useState<AdminInvitationPreview>();
  const [previewFailed, setPreviewFailed] = useState(false);

  // GET de vista previa: muestra hospital y plazo reales y nunca consume el token.
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchAdminInvitationPreview(token).then(
      (data) => { if (live) setPreview(data); },
      (error: unknown) => {
        if (!live) return;
        const next = tokenStatusFor(error);
        if (next) setStatus(next);
        else setPreviewFailed(true);
      },
    );
    return () => { live = false; };
  }, [token]);

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
        <TokenStatusView status={status} copy={adminCopy} validContent={
            preview && token ? (
              <ClaimAdminInvitation token={token} preview={preview} onLinkProblem={setStatus} />
            ) : previewFailed ? (
              <Alert tone="danger" title="No pudimos abrir la invitación">Revisa tu conexión e inténtalo de nuevo en unos minutos.</Alert>
            ) : (
              <Loading message="Comprobando la invitación." />
            )
          } />
      </div>
    </AuthShell>
  );
}

function ClaimAdminInvitation({ token, preview, onLinkProblem }: { token: string; preview: AdminInvitationPreview; onLinkProblem: (status: TokenStatus) => void }) {
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function claim(password: string) {
    const session = await claimAdminInvitation(token, password);
    // La cuenta ya existe y el enlace está consumido: un fallo del CSRF no debe presentarse como fallo del reclamo.
    // Sin CSRF la sesión no queda en memoria y /verificar-identidad lleva a ingresar con la cuenta nueva.
    const csrfToken = await fetchCsrfToken().catch(() => null);
    // La cuenta nace con aal 1: la sesión queda en memoria para configurar MFA en /verificar-identidad.
    if (csrfToken) setAuthSession({ ...session, csrfToken });
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
        <dd className="text-ink">{preview.hospitalName}</dd>
        <dt className="text-sm font-semibold text-muted">Rol</dt>
        <dd className="text-ink">Administrador de hospital</dd>
        <dt className="text-sm font-semibold text-muted">Vence</dt>
        <dd className="text-ink">{formatDateTime(preview.expiresAt)}</dd>
      </dl>
      <Alert tone="info" title="Abrir el enlace no cambia nada">
        La cuenta solo se crea al guardar la contraseña. El enlace se usa una sola vez.
      </Alert>
      <PasswordClaimForm submitLabel="Crear contraseña y continuar" claim={claim} onDone={() => setDone(true)} onLinkProblem={onLinkProblem} />
    </AuthCard>
  );
}
