import { openPayload, sealPayload, SealedPayloadError, type OutboxKeyring } from '../../../shared/crypto/outbox-cipher.js';
import { actionLink, renderTemplate, type ActionRoute, type EmailKind, type RenderedEmail } from '../templates/index.js';

/**
 * Contenido cifrado de un correo del outbox. El token y, salvo en las invitaciones (cuyo destinatario sale de
 * `auth.users`), el destinatario viajan solo aquí: nunca en claro en la base ni en los registros.
 */
export type EmailPayload = Readonly<{
  recipient?: string;
  token: string;
  /** Solo `invitacion`: el segundo enlace (rechazar); `token` confirma. */
  rejectToken?: string;
  hospitalName?: string;
  sitePublicName?: string;
  deadline?: string;
}>;

const ROUTE: Readonly<Record<EmailKind, ActionRoute>> = Object.freeze({
  invitacion: '/invitaciones',
  verificacion_email: '/verificar-correo',
  alta_asistida: '/activar-cuenta',
  cambio_email: '/cambiar-correo',
  recuperacion: '/restablecer-contrasena',
  invitacion_admin: '/invitacion-administrador',
});

const KEYS = ['recipient', 'token', 'rejectToken', 'hospitalName', 'sitePublicName', 'deadline'] as const;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** Cifra el payload con el id del outbox como AAD: no sirve en otra fila. */
export function sealEmailPayload(keyring: OutboxKeyring, outboxId: string, payload: EmailPayload): string {
  return sealPayload(keyring, JSON.stringify(payload), outboxId);
}

/** Descifra y valida la forma; cualquier problema es un `SealedPayloadError` genérico. */
export function openEmailPayload(keyring: OutboxKeyring, outboxId: string, sealed: string): EmailPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(openPayload(keyring, sealed, outboxId));
  } catch {
    throw new SealedPayloadError();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new SealedPayloadError();
  const record = parsed as Record<string, unknown>;
  if (!Object.keys(record).every((key) => (KEYS as readonly string[]).includes(key))) throw new SealedPayloadError();
  if (typeof record.token !== 'string') throw new SealedPayloadError();
  if (record.rejectToken !== undefined && typeof record.rejectToken !== 'string') throw new SealedPayloadError();
  for (const key of ['recipient', 'hospitalName', 'sitePublicName', 'deadline'] as const) {
    if (record[key] !== undefined && (typeof record[key] !== 'string' || (record[key] as string).length > 300)) throw new SealedPayloadError();
  }
  if (record.recipient !== undefined && !EMAIL.test(record.recipient as string)) throw new SealedPayloadError();
  return Object.freeze({ ...record }) as EmailPayload;
}

/** Datos de presentación que el reclamo trae de la base al enviar (solo `invitacion`): siempre vigentes, nunca sellados. */
export type EmailContext = Readonly<{ display?: Readonly<{ hospitalName: string; sitePublicName: string }>; notAfter?: string }>;

// El plazo de la convocatoria es el `not_after` del correo, en UTC y en español.
const formatDeadline = (iso: string): string =>
  `${new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))} UTC`;

/** Arma el correo de un tipo a partir de su payload; lanza `SealedPayloadError` si falta algún dato requerido. */
export function renderEmail(kind: EmailKind, payload: EmailPayload, appPublicUrl: string, context: EmailContext = {}): RenderedEmail {
  // `rejectToken` existe solo en la invitación al donante: en otro tipo, o ausente en ella, el payload no es válido.
  if ((payload.rejectToken !== undefined) !== (kind === 'invitacion')) throw new SealedPayloadError();
  let link: string;
  let rejectLink = '';
  try {
    link = actionLink(appPublicUrl, ROUTE[kind], payload.token);
    if (payload.rejectToken !== undefined) rejectLink = actionLink(appPublicUrl, ROUTE[kind], payload.rejectToken);
  } catch {
    throw new SealedPayloadError();
  }
  const need = <T>(value: T | undefined): T => {
    if (value === undefined) throw new SealedPayloadError();
    return value;
  };
  switch (kind) {
    case 'invitacion':
      return renderTemplate('invitacion', {
        hospitalName: need(payload.hospitalName ?? context.display?.hospitalName),
        sitePublicName: need(payload.sitePublicName ?? context.display?.sitePublicName),
        deadline: need(payload.deadline ?? (context.notAfter === undefined ? undefined : formatDeadline(context.notAfter))),
        link, rejectLink,
      });
    case 'alta_asistida':
      return renderTemplate('alta_asistida', { hospitalName: need(payload.hospitalName), link });
    case 'invitacion_admin':
      return renderTemplate('invitacion_admin', { hospitalName: need(payload.hospitalName), link });
    case 'verificacion_email':
      return renderTemplate('verificacion_email', { link });
    case 'cambio_email':
      return renderTemplate('cambio_email', { link });
    case 'recuperacion':
      return renderTemplate('recuperacion', { link });
  }
}
