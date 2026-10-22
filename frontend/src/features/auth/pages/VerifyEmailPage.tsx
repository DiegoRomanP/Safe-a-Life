import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { AuthShell } from '../components/AuthShell.js';
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import { StepList } from '../components/StepList.js';
import { registrationSteps } from '../registrationSteps.js';
import { TokenConfirmCard } from '../components/TokenConfirmCard.js';
import { TokenStatusView, type TokenStatus } from '../components/TokenStatusView.js';
import { useFragmentToken } from '../useFragmentToken.js';

// AUTH-02 paso 2 (`/verificar-correo#token`). Vista previa con
// getDonorEmailVerificationPreview; el botón corresponde a verifyDonorEmail.
// La cuenta sigue inactiva hasta completar el perfil (DON-01).
export function VerifyEmailPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');

  return (
    <AuthShell
      asideTitle="Crea tu cuenta de donante"
      asideDetail="Completa tu perfil con datos sintéticos para participar en la demostración."
      asideContent={<StepList label="Pasos del registro" steps={registrationSteps} current={2} />}
      asideFooter={
        <Alert tone="info" title="Privacidad del enlace">
          El token nunca se muestra en esta vista. No ingreses credenciales reales.
        </Alert>
      }
    >
      <div className="flex w-full max-w-[640px] flex-col items-center gap-6">
        {import.meta.env.DEV && <DevStatusPicker value={status} onChange={setStatus} />}
        <TokenStatusView
          status={status}
          validContent={
            <TokenConfirmCard
              idPrefix="verificar-correo"
              title="Verifica tu correo"
              description="Confirma que este correo es tuyo para continuar con el registro."
              actionLabel="Verificar correo"
              doneTitle="Correo verificado"
              doneDetail="Ingresa para completar tu perfil. La cuenta se activa cuando el perfil obligatorio esté completo."
              doneLink={{ to: '/ingresar', label: 'Ingresar' }}
            />
          }
        />
      </div>
    </AuthShell>
  );
}
