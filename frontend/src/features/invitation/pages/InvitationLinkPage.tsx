import { useEffect, useState } from 'react';
import { Brand } from '../../../components/layout/Brand.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { ApiError } from '../../../lib/demoApi.js';
import {
  defaultTokenStatusCopy,
  TokenStatusView,
  type TokenStatus,
  type TokenStatusCopy,
} from '../../auth/components/TokenStatusView.js';
import { useFragmentToken } from '../../auth/useFragmentToken.js';
import { fetchInvitationPreview, respondWithToken } from '../api.js';
import { InvitationLinkCard, type InvitationActionPreview } from '../components/InvitationLinkCard.js';

// El backend no distingue por qué un enlace ya no sirve (404 desconocido, 410 gastado, cerrado, vencido o con la meta alcanzada).
const linkCopy: TokenStatusCopy = {
  ...defaultTokenStatusCopy,
  used: { ...defaultTokenStatusCopy.used, badge: 'No disponible', detail: 'Este enlace ya no admite respuestas: ya se usó o la convocatoria terminó. Ingresa para ver tu invitación.' },
  expired: {
    ...defaultTokenStatusCopy.expired,
    badge: 'Vencido',
    detail: 'La invitación ya no admite respuestas. No necesitas hacer nada más.',
  },
};

type Load = { phase: 'loading' } | { phase: 'ready'; preview: InvitationActionPreview } | { phase: 'error' };

// LINK-01 Responder invitación desde el correo (`/invitaciones#token`). Abrir la vista solo pide la vista previa mínima
// (getInvitationActionPreview, sin efectos); la respuesta se registra únicamente al pulsar el botón.
export function InvitationLinkPage() {
  const { token } = useFragmentToken();
  const [status, setStatus] = useState<TokenStatus>(token ? 'valid' : 'invalid');
  const [load, setLoad] = useState<Load>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchInvitationPreview(token).then(
      (preview) => active && setLoad({ phase: 'ready', preview }),
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) setStatus('invalid');
        else if (error instanceof ApiError && error.status === 410) setStatus('used');
        else setLoad({ phase: 'error' });
      },
    );
    return () => { active = false; };
  }, [token, attempt]);

  function retry() {
    setLoad({ phase: 'loading' });
    setAttempt((current) => current + 1);
  }

  const valid =
    load.phase === 'ready' && token ? (
      <InvitationLinkCard preview={load.preview} onConfirm={() => respondWithToken(token)} onUnavailable={() => setStatus('used')} />
    ) : load.phase === 'error' ? (
      <Alert tone="danger" title="No pudimos abrir la invitación">
        <Button onClick={retry}>Reintentar</Button>
      </Alert>
    ) : (
      <p role="status" className="text-muted">Abriendo tu invitación…</p>
    );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-14">
        <Brand />
        <Badge tone="info">Enlace seguro · un solo uso</Badge>
      </header>
      <main className="flex flex-1 flex-col items-center gap-6 px-4 pb-12">
        <TokenStatusView status={status} copy={linkCopy} validContent={valid} />
      </main>
    </div>
  );
}
