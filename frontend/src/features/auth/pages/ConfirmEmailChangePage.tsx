import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { AuthShell } from '../components/AuthShell.js';
import { DevStatusPicker } from '../components/DevStatusPicker.js';
import { TokenConfirmCard } from '../components/TokenConfirmCard.js';
import {
  defaultTokenStatusCopy,
  TokenStatusView,
  type TokenStatus,
  type TokenStatusCopy,
} from '../components/TokenStatusView.js';
import { useFragmentToken } from '../useFragmentToken.js';

// El enlace vencido se renueva desde la cuenta, no con el hospital.
const changeCopy: TokenStatusCopy = {
  ...defaultTokenStatusCopy,
  used: { ...defaultTokenStatusCopy.used, badge: 'Usado' },
  expired: {
    ...defaultTokenStatusCopy.expired,
    badge: 'Vencido',
    detail: 'Crea una nueva solicitud de cambio de correo desde tu cuenta.',
  },
};

// Confirmar cambio de correo (`/cambiar-correo#token`), enlace que llega al
// correo nuevo. Vista previa con getEmailChangePreview; el botón corresponde
// a verifyEmailChange.
export function ConfirmEmailChangePage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');

  return (
    <AuthShell
      asideTitle="Cambiar correo"
      asideDetail="El nuevo correo reemplaza al anterior solo después de confirmarlo."
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
          copy={changeCopy}
          validContent={
            <TokenConfirmCard
              idPrefix="cambiar-correo"
              title="Confirma tu nuevo correo"
              description="Al confirmar, usarás este correo para ingresar y recibir avisos."
              actionLabel="Confirmar nuevo correo"
              doneTitle="Correo actualizado"
              doneDetail="El cambio quedó confirmado. Ingresa con tu nuevo correo."
              doneLink={{ to: '/ingresar', label: 'Ingresar' }}
            />
          }
        />
      </div>
    </AuthShell>
  );
}
