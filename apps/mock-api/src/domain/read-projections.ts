import type { DemoInvitation, DemoNeed } from './model.js';

// The local mock projects elapsed time on reads; it does not persist a job or
// emulate PostgreSQL's clock. Callers supply one timestamp per request.
export function needStatusForRead(need: Readonly<DemoNeed>, now: number): DemoNeed['status'] {
  return need.status === 'activa' && now >= Date.parse(need.expiresAt) ? 'vencida' : need.status;
}

export function invitationValidityForRead(
  invitation: Readonly<DemoInvitation>,
  need: Readonly<DemoNeed>,
  now: number,
): DemoInvitation['validity'] {
  if (invitation.validity !== 'activa' || invitation.response !== 'sin_respuesta') {
    return invitation.validity;
  }
  const status = needStatusForRead(need, now);
  if (status === 'cerrada' || status === 'cancelada') return 'invalidada';
  return status === 'vencida' ? 'vencida' : invitation.validity;
}
