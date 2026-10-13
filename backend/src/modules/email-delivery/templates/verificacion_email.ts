import { compose, type RenderedEmail } from './common.js';

export type VerificacionEmailData = Readonly<{ link: string }>;

export function verificacionEmail({ link }: VerificacionEmailData): RenderedEmail {
  return compose('Verifica tu correo', [
    'Recibimos una solicitud para registrarte como donante. Abre el enlace para verificar tu correo.',
    'Si no fuiste tú, ignora este mensaje.',
  ], link);
}
