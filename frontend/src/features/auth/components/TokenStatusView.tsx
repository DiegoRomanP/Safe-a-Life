import type { ReactNode } from 'react';
import { Badge } from '../../../components/ui/Badge.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import type { Tone } from '../../../components/ui/tones.js';
import { AuthCard } from './AuthShell.js';

export type TokenStatus = 'valid' | 'used' | 'expired' | 'invalid';

type StatusCopy = { title: string; badge: string; tone: Tone; detail: string };

export type TokenStatusCopy = Record<Exclude<TokenStatus, 'valid'>, StatusCopy>;

// Textos de Penpot (AUTH-03, estados Usado, Vencido e Inválido). Los mismos
// mensajes sirven para cualquier enlace de un solo uso.
export const defaultTokenStatusCopy: TokenStatusCopy = {
  used: {
    title: 'Enlace ya utilizado',
    badge: 'Usada',
    tone: 'neutral',
    detail: 'Este enlace ya no admite cambios. Ingresa o recupera tu contraseña.',
  },
  expired: {
    title: 'Enlace vencido',
    badge: 'Vencida',
    tone: 'warning',
    detail: 'Solicita al hospital autorizado una nueva invitación para continuar.',
  },
  invalid: {
    title: 'Enlace no disponible',
    badge: 'No disponible',
    tone: 'danger',
    detail: 'No podemos validar este recurso. Revisa el enlace o solicita uno nuevo.',
  },
};

export type TokenStatusViewProps = {
  status: TokenStatus;
  validContent: ReactNode;
  copy?: TokenStatusCopy;
};

// Tarjeta del estado de un enlace con token. En «valid» muestra el contenido
// que entrega la vista; en los demás, el mensaje neutral y la salida.
export function TokenStatusView({ status, validContent, copy = defaultTokenStatusCopy }: TokenStatusViewProps) {
  if (status === 'valid') return <>{validContent}</>;
  const { title, badge, tone, detail } = copy[status];
  return (
    <AuthCard labelledBy="token-estado-titulo" className="max-w-[640px]">
      <Badge tone={tone} className="self-start">
        {badge}
      </Badge>
      <div className="flex flex-col gap-2">
        <h1 id="token-estado-titulo" className="text-3xl font-bold text-ink">
          {title}
        </h1>
        <p className="text-muted">{detail}</p>
      </div>
      <div>
        {status === 'used' ? (
          <LinkButton to="/ingresar">Volver a ingresar</LinkButton>
        ) : (
          <LinkButton to="/">Volver a inicio</LinkButton>
        )}
      </div>
    </AuthCard>
  );
}
