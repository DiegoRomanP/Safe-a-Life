import { LinkButton } from '../ui/LinkButton.js';
import { StatePanel } from './StatePanel.js';

export type ForbiddenStateProps = { backTo: string; backLabel: string; className?: string };

// Sin permiso o inexistente (403/404). Mismo mensaje neutro que SYS-01 en
// ambos casos, para no revelar si el recurso existe.
export function ForbiddenState({ backTo, backLabel, className }: ForbiddenStateProps) {
  return (
    <StatePanel
      tone="neutral"
      symbol="i"
      title="Sin acceso"
      message="No pudimos abrir este recurso"
      detail="Puede que no exista, que haya cambiado o que tu cuenta no tenga acceso. Por seguridad no mostramos más información."
      action={
        <LinkButton to={backTo} variant="secondary">
          {backLabel}
        </LinkButton>
      }
      className={className}
    />
  );
}
