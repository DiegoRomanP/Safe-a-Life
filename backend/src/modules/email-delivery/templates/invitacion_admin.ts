import { compose, type RenderedEmail } from './common.js';

export type InvitacionAdminData = Readonly<{ hospitalName: string; link: string }>;

export function invitacionAdmin({ hospitalName, link }: InvitacionAdminData): RenderedEmail {
  return compose('Invitación como administrador hospitalario', [
    `Te invitaron a administrar las necesidades de sangre de ${hospitalName}. Abre el enlace para aceptar y crear tu contraseña.`,
    'Si no esperabas este mensaje, ignóralo.',
  ], link);
}
