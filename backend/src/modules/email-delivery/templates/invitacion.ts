import { compose, INTENT_NOTICE, type RenderedEmail } from './common.js';

export type InvitacionData = Readonly<{ hospitalName: string; sitePublicName: string; deadline: string; link: string }>;

/** Convocatoria general: sin grupo sanguíneo, ubicación, distancia ni datos de paciente. */
export function invitacion({ hospitalName, sitePublicName, deadline, link }: InvitacionData): RenderedEmail {
  return compose('Convocatoria de donación de sangre', [
    `${hospitalName} necesita donantes de sangre y te invita a participar en ${sitePublicName}.`,
    `La convocatoria está abierta hasta ${deadline}.`,
    'Abre el enlace para ver los detalles y responder.',
    INTENT_NOTICE,
  ], link);
}
