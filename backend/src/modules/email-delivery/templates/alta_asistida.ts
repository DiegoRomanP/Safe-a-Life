import { compose, type RenderedEmail } from './common.js';

export type AltaAsistidaData = Readonly<{ hospitalName: string; link: string }>;

export function altaAsistida({ hospitalName, link }: AltaAsistidaData): RenderedEmail {
  return compose('Activa tu cuenta de donante', [
    `${hospitalName} te preparó un registro como donante. Abre el enlace para activar tu cuenta y elegir tu contraseña.`,
    'Si no esperabas este mensaje, ignóralo.',
  ], link);
}
