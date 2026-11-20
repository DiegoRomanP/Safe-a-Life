import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard } from './AuthShell.js';

export type TokenConfirmCardProps = {
  idPrefix: string;
  title: string;
  description: string;
  actionLabel: string;
  doneTitle: string;
  doneDetail: string;
  doneLink: { to: string; label: string };
  /** Acción real (POST). Devuelve `true` si se completó; sin ella la tarjeta es demo y no envía nada. */
  onConfirm?: () => Promise<boolean>;
};

// Tarjeta de un enlace de un solo uso en estado válido. Mostrarla equivale a la
// vista previa (GET), que nunca consume el token; solo el botón ejecuta la
// acción (POST), una sola vez aunque se pulse de nuevo mientras está en curso.
// Al terminar, el foco pasa al título del resultado.
export function TokenConfirmCard({
  idPrefix,
  title,
  description,
  actionLabel,
  doneTitle,
  doneDetail,
  doneLink,
  onConfirm,
}: TokenConfirmCardProps) {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

  async function confirm() {
    if (!onConfirm) return setDone(true);
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    const ok = await onConfirm().catch(() => false);
    inFlight.current = false;
    setPending(false);
    if (ok) setDone(true);
    else setFailed(true);
  }

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  if (done) {
    return (
      <AuthCard labelledBy={`${idPrefix}-hecho`} className="max-w-[640px]">
        <Badge tone="success" className="self-start">
          Completado
        </Badge>
        <div className="flex flex-col gap-2">
          <h1 id={`${idPrefix}-hecho`} ref={doneRef} tabIndex={-1} className="text-3xl font-bold text-ink">
            {doneTitle}
          </h1>
          <p className="text-muted">{doneDetail}</p>
        </div>
        {!onConfirm && (
          <Alert tone="info" title="Prototipo académico">
            Esta pantalla no envía datos ni procesa cuentas reales.
          </Alert>
        )}
        <div>
          <LinkButton to={doneLink.to}>{doneLink.label}</LinkButton>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy={`${idPrefix}-titulo`} className="max-w-[640px]">
      <Badge tone="success" className="self-start">
        Enlace válido
      </Badge>
      <div className="flex flex-col gap-2">
        <h1 id={`${idPrefix}-titulo`} className="text-3xl font-bold text-ink">
          {title}
        </h1>
        <p className="text-muted">{description}</p>
      </div>
      <Alert tone="info" title="Abrir el enlace no cambia nada">
        La acción solo ocurre al pulsar el botón. El enlace se usa una sola vez.
      </Alert>
      <div aria-live="polite" className="live-slot">
        {failed && (
          <Alert tone="danger" title="No se pudo completar">
            Revisa tu conexión e inténtalo de nuevo. Si hiciste varios intentos, espera unos minutos.
          </Alert>
        )}
      </div>
      <div>
        <Button onClick={() => void confirm()} aria-disabled={pending} aria-busy={pending}>
          {pending ? 'Procesando…' : actionLabel}
        </Button>
      </div>
    </AuthCard>
  );
}
