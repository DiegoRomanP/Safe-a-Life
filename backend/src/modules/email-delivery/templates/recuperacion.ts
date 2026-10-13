import { compose, type RenderedEmail } from './common.js';

export type RecuperacionData = Readonly<{ link: string }>;

export function recuperacion({ link }: RecuperacionData): RenderedEmail {
  return compose('Restablece tu contraseña', [
    'Recibimos una solicitud para restablecer tu contraseña. Abre el enlace para elegir una nueva.',
    'Si no fuiste tú, ignora este mensaje.',
  ], link);
}
