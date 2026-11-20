import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmailMessage, EmailSender, SendResult } from '../application/email-sender.js';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ENTITIES[char]);

/**
 * Buzón local (solo desarrollo, decisión 2026-10-30): guarda cada correo como HTML en `dir` para abrir sus enlaces en una
 * demo sin proveedor real. `parseEnv` lo rechaza en producción. Nunca registra el contenido; un fallo de disco es
 * transitorio y el worker reintenta.
 */
export function createDevMailboxSender(dir: string): EmailSender {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      // Un archivo por clave de outbox: un reintento del mismo correo no lo duplica (como la deduplicación del proveedor).
      const name = `${message.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, '_')}.html`;
      try {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await chmod(dir, 0o700);
        const header = `<p><strong>Para:</strong> ${escapeHtml(message.to)}</p><p><strong>Asunto:</strong> ${escapeHtml(message.subject)}</p><hr>`;
        await writeFile(join(dir, name), header + message.html, { mode: 0o600, flag: 'wx' });
        return { kind: 'ok', providerMessageId: name };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { kind: 'ok', providerMessageId: name };
        return { kind: 'transitorio' };
      }
    },
  };
}
