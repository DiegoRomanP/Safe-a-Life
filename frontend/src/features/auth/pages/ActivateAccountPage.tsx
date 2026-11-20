import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { apiRequest } from '../../../lib/api/http.js';
import { PasswordClaimForm } from '../components/PasswordClaimForm.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import { TokenStatusView, type TokenStatus } from '../components/TokenStatusView.js';
import { useFragmentToken } from '../useFragmentToken.js';

// AUTH-03 Reclamar cuenta asistida (`/activar-cuenta#token`, contenido de
// Penpot «SaL» con estilo «+»). Abrir la vista nunca consume el token; el estado
// del enlace se conoce al reclamar (claimAssistedRegistration).
// shortcut: sin GET de vista previa (getAssistedActivationPreview); añadirlo si se quiere mostrar hospital y plazo.
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
          validContent={step === 'preview' || !token ? <ValidInvitation onContinue={() => setStep('password')} /> : <ClaimPassword token={token} onLinkProblem={setStatus} />}
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

function ClaimPassword({ token, onLinkProblem }: { token: string; onLinkProblem: (status: TokenStatus) => void }) {
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), [done]);

  async function claim(password: string) {
    await apiRequest('POST', `/assisted-activation-actions/${encodeURIComponent(token)}/claim`, { body: { password } });
  }

  if (done) {
    return (
      <AuthCard labelledBy="activar-hecho" className="max-w-[640px]">
        <Badge tone="success" className="self-start">
          Completado
        </Badge>
        <h1 id="activar-hecho" ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-ink">
          Cuenta activada
        </h1>
        <p className="text-muted">Ingresa con tu correo y tu contraseña nueva, y completa tu perfil de donante.</p>
        <div>
          <LinkButton to="/ingresar">Ingresar</LinkButton>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="activar-contrasena-titulo" className="max-w-[640px]">
      <h1 id="activar-contrasena-titulo" ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-ink">
        Crea tu contraseña
      </h1>
      <PasswordClaimForm submitLabel="Activar cuenta" claim={claim} onDone={() => setDone(true)} onLinkProblem={onLinkProblem} />
    </AuthCard>
  );
}
