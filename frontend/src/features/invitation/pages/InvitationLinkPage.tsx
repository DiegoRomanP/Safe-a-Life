import { useState } from 'react';
import { Brand } from '../../../components/layout/Brand.js';
import { Badge } from '../../../components/ui/Badge.js';
import { DevStatusPicker } from '../../auth/components/DevStatusPicker.js';
import {
  defaultTokenStatusCopy,
  TokenStatusView,
  type TokenStatus,
  type TokenStatusCopy,
} from '../../auth/components/TokenStatusView.js';
import { useFragmentToken } from '../../auth/useFragmentToken.js';
import { InvitationLinkCard, type InvitationActionPreview } from '../components/InvitationLinkCard.js';

// Vista previa sintética mientras no hay cliente HTTP (D-4).
const demoPreview: InvitationActionPreview = {
  hospitalName: 'Hospital Nacional Central',
  publicSiteName: 'Sede San Borja',
  intendedAction: 'confirmar',
  expiresAt: '2026-09-24T23:00:00Z',
};

// Una invitación vencida o cerrada no admite respuestas desde el correo.
const linkCopy: TokenStatusCopy = {
  ...defaultTokenStatusCopy,
  used: { ...defaultTokenStatusCopy.used, badge: 'Usado', detail: 'Este enlace ya se usó. Ingresa para ver o cambiar tu respuesta.' },
  expired: {
    ...defaultTokenStatusCopy.expired,
    badge: 'Vencido',
    detail: 'La invitación ya no admite respuestas. No necesitas hacer nada más.',
  },
};

// LINK-01 Responder invitación desde el correo (`/invitaciones#token`, Penpot
// «+»). Encabezado mínimo con «Enlace seguro · un solo uso».
export function InvitationLinkPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-14">
        <Brand />
        <Badge tone="info">Enlace seguro · un solo uso</Badge>
      </header>
      <main className="flex flex-1 flex-col items-center gap-6 px-4 pb-12">
        {import.meta.env.DEV && <DevStatusPicker value={status} onChange={setStatus} />}
        <TokenStatusView status={status} copy={linkCopy} validContent={<InvitationLinkCard preview={demoPreview} />} />
      </main>
    </div>
  );
}
