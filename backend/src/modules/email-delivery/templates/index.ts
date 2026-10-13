import type { RenderedEmail } from './common.js';
import { altaAsistida, type AltaAsistidaData } from './alta_asistida.js';
import { cambioEmail, type CambioEmailData } from './cambio_email.js';
import { invitacion, type InvitacionData } from './invitacion.js';
import { invitacionAdmin, type InvitacionAdminData } from './invitacion_admin.js';
import { recuperacion, type RecuperacionData } from './recuperacion.js';
import { verificacionEmail, type VerificacionEmailData } from './verificacion_email.js';

export { actionLink, escapeHtml, type ActionRoute, type RenderedEmail } from './common.js';

export const EMAIL_KINDS = ['invitacion', 'verificacion_email', 'alta_asistida', 'cambio_email', 'recuperacion', 'invitacion_admin'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailTemplateData = Readonly<{
  invitacion: InvitacionData;
  verificacion_email: VerificacionEmailData;
  alta_asistida: AltaAsistidaData;
  cambio_email: CambioEmailData;
  recuperacion: RecuperacionData;
  invitacion_admin: InvitacionAdminData;
}>;

const RENDERERS: { readonly [K in EmailKind]: (data: EmailTemplateData[K]) => RenderedEmail } = {
  invitacion,
  verificacion_email: verificacionEmail,
  alta_asistida: altaAsistida,
  cambio_email: cambioEmail,
  recuperacion,
  invitacion_admin: invitacionAdmin,
};

export function renderTemplate<K extends EmailKind>(kind: K, data: EmailTemplateData[K]): RenderedEmail {
  return RENDERERS[kind](data);
}
