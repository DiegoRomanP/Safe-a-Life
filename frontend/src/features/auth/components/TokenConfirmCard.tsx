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
};

// Tarjeta de un enlace de un solo uso en estado válido. Mostrarla equivale a la
// vista previa (GET), que nunca consume el token; solo el botón ejecuta la
// acción (POST). Sin backend (D-4) la acción no se envía. Al terminar, el foco
// pasa al título del resultado.
export function TokenConfirmCard({
  idPrefix,
  title,
  description,
  actionLabel,
  doneTitle,
  doneDetail,
  doneLink,
}: TokenConfirmCardProps) {
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);

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
        <Alert tone="brand" title="Prototipo académico">
          Esta pantalla no envía datos ni procesa cuentas reales.
        </Alert>
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
      <div>
        <Button onClick={() => setDone(true)}>{actionLabel}</Button>
      </div>
    </AuthCard>
  );
}
