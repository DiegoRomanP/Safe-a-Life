import { compose, type RenderedEmail } from './common.js';

export type CambioEmailData = Readonly<{ link: string }>;

export function cambioEmail({ link }: CambioEmailData): RenderedEmail {
  return compose('Confirma el cambio de tu correo', [
    'Pediste cambiar el correo de tu cuenta. Abre el enlace para confirmarlo.',
    'Si no fuiste tú, ignora este mensaje; tu correo actual no cambiará.',
  ], link);
}
