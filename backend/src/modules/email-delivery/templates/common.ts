/** Piezas comunes de las plantillas de correo. Puras: sin I/O ni reloj. */
export type RenderedEmail = Readonly<{ subject: string; text: string; html: string }>;

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** SAF-01: la matriz de compatibilidad es académica. */
export const ACADEMIC_DISCLAIMER = 'Este es un prototipo académico. La compatibilidad que usa es una matriz de referencia académica y no sustituye la evaluación de un profesional de salud.';

/** SAF-02: confirmar solo expresa intención. */
export const INTENT_NOTICE = 'Confirmar significa que tienes la intención de asistir; no es una cita médica ni garantiza una donación.';

const ROUTES = ['/invitaciones', '/verificar-correo', '/activar-cuenta', '/cambiar-correo', '/restablecer-contrasena', '/invitacion-administrador'] as const;
export type ActionRoute = (typeof ROUTES)[number];

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

/**
 * Enlace de acción `APP_PUBLIC_URL/<ruta>#<token>`. El token va en el fragmento para que no viaje en el
 * `Referer` ni en los registros del servidor.
 */
export function actionLink(appPublicUrl: string, route: ActionRoute, token: string): string {
  if (!ROUTES.includes(route) || !TOKEN_PATTERN.test(token)) throw new RangeError('Enlace de acción no válido.');
  return `${appPublicUrl.replace(/\/$/, '')}${route}#${token}`;
}

/** Arma texto y HTML a partir de párrafos y un enlace; escapa todo lo que viene de datos. */
export function compose(subject: string, paragraphs: readonly string[], link: string | null): RenderedEmail {
  const textParts = [...paragraphs, ...(link === null ? [] : [link]), ACADEMIC_DISCLAIMER];
  const htmlParts = [
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(link === null ? [] : [`<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`]),
    `<p><small>${escapeHtml(ACADEMIC_DISCLAIMER)}</small></p>`,
  ];
  return Object.freeze({ subject, text: textParts.join('\n\n'), html: htmlParts.join('\n') });
}
