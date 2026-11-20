import { useEffect, useRef, useState } from 'react';
import type { TokenResponseOutcome } from '../api.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { formatDateTime } from '../../../lib/format.js';
import { AuthCard } from '../../auth/components/AuthShell.js';

// Forma de getInvitationActionPreview.
export type InvitationActionPreview = {
  hospitalName: string;
  publicSiteName: string;
  intendedAction: 'confirmar' | 'rechazar';
  expiresAt: string;
};

const copy = {
  confirmar: {
    title: '¿Deseas registrar tu intención de asistir?',
    action: 'Confirmar intención de asistir',
    done: 'Registramos tu intención de asistir.',
    note: 'Abrir este enlace no registra una respuesta. Confirmar expresa únicamente intención de asistir. El hospital verificará tu identidad, grupo y elegibilidad antes de cualquier donación.',
  },
  rechazar: {
    title: '¿Confirmas que no podrás asistir?',
    action: 'Confirmar que no podré asistir',
    done: 'Registramos que no podrás asistir.',
    note: 'Abrir este enlace no registra una respuesta. Solo se registra al confirmar.',
  },
} as const;

// Tarjeta de LINK-01 (Penpot «+») para un enlace válido. Muestra solo los
// campos de InvitationActionPreview, una vista previa mínima sin sesión. El
// token ya trae la acción y recordInitialInvitationResponse no acepta otra, así
// que hay un solo botón; cambiar la respuesta se hace desde la cuenta. Abrir la
// tarjeta no registra nada: solo el botón envía la respuesta.
export type InvitationLinkCardProps = {
  preview: InvitationActionPreview;
  /** Envía la respuesta del enlace; `unavailable` (gastado, cerrado, meta alcanzada) lo resuelve quien usa la tarjeta. */
  onConfirm: () => Promise<TokenResponseOutcome>;
  onUnavailable: () => void;
};

export function InvitationLinkCard({ preview, onConfirm, onUnavailable }: InvitationLinkCardProps) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const text = copy[preview.intendedAction];

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const outcome = await onConfirm();
    inFlight.current = false;
    setBusy(false);
    if (outcome === 'ok') setDone(true);
    else if (outcome === 'unavailable') onUnavailable();
    else setFailed(true);
  }

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  if (done) {
    return (
      <AuthCard labelledBy="enlace-hecho" className="max-w-[796px]">
        <Badge tone="success" className="self-start">
          Respuesta registrada
        </Badge>
        <div className="flex flex-col gap-2">
          <h1 id="enlace-hecho" ref={doneRef} tabIndex={-1} className="text-3xl font-bold text-ink">
            {text.done}
          </h1>
          <p className="text-muted">
            Puedes cambiar tu respuesta desde tu cuenta mientras la invitación siga activa.
          </p>
        </div>
        <Alert tone="info" title="Prototipo académico">
          La respuesta expresa solo tu intención. El hospital verificará tu identidad, grupo y elegibilidad.
        </Alert>
        <div>
          <LinkButton to="/ingresar">Ingresar a mi cuenta</LinkButton>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="enlace-titulo" className="max-w-[796px]">
      <Badge tone="info" className="self-start">
        Invitación informativa
      </Badge>
      <h1 id="enlace-titulo" className="text-3xl font-bold text-ink">
        {text.title}
      </h1>
      <div>
        <h2 className="text-xl font-semibold text-petrol">{preview.hospitalName}</h2>
        <p className="text-muted">{preview.publicSiteName}</p>
      </div>
      <hr className="border-line" />
      <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="text-sm font-semibold text-muted">Plazo</dt>
        <dd className="text-ink">{formatDateTime(preview.expiresAt)}</dd>
      </dl>
      <Alert tone="info" title="Antes de responder">
        {text.note}
      </Alert>
      <div aria-live="assertive" className="live-slot">
        {failed && (
          <Alert tone="danger" title="No pudimos registrar tu respuesta">
            Intenta de nuevo en unos minutos. Si el problema sigue, ingresa a tu cuenta.
          </Alert>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <Button aria-disabled={busy} aria-busy={busy} onClick={() => void confirm()}>{text.action}</Button>
        <LinkButton to="/ingresar" variant="ghost">
          Ingresar para ver la invitación
        </LinkButton>
      </div>
    </AuthCard>
  );
}
