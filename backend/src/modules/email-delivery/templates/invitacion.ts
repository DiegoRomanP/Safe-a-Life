import { compose, INTENT_NOTICE, type RenderedEmail } from './common.js';

export type InvitacionData = Readonly<{ hospitalName: string; sitePublicName: string; deadline: string; link: string; rejectLink: string }>;

/** Convocatoria general con un enlace por acción (confirmar y rechazar): sin grupo sanguíneo, ubicación, distancia ni datos de paciente. */
export function invitacion({ hospitalName, sitePublicName, deadline, link, rejectLink }: InvitacionData): RenderedEmail {
  return compose('Convocatoria de donación de sangre', [
    `${hospitalName} necesita donantes de sangre y te invita a participar en ${sitePublicName}.`,
    `La convocatoria está abierta hasta ${deadline}.`,
    INTENT_NOTICE,
    'El hospital verificará tu identidad y tu elegibilidad antes de cualquier donación.',
    'Si tienes la intención de asistir, abre este enlace para confirmarlo:',
  ], link, [{ label: 'Si no podrás asistir, abre este otro enlace para indicarlo:', url: rejectLink }]);
}
