import type { EmailMessage, EmailSender, SendResult } from '../application/email-sender.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export type FakeSendRecord = Readonly<{ kind: SendResult['kind']; idempotencyKey: string; at: number }>;

/**
 * Remitente falso (ADR-001). Guarda en memoria solo el resultado, la clave de idempotencia y la hora:
 * nunca el destinatario, el asunto ni el cuerpo. `script` programa el resultado de cada llamada.
 */
export class FakeEmailSender implements EmailSender {
  readonly records: FakeSendRecord[] = [];

  constructor(
    private readonly script: (callNumber: number, message: Pick<EmailMessage, 'idempotencyKey'>) => SendResult = (callNumber) => ({
      kind: 'ok',
      providerMessageId: `fake-${callNumber}`,
      httpStatus: 200,
    }),
    private readonly now: () => number = Date.now,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    // Buzón explícito de pruebas: solo en entorno local y nunca en producción.
    if (process.env.SAL_DEV_MAILBOX === '1') {
      if (process.env.NODE_ENV === 'production' || process.env.APP_PUBLIC_URL !== 'http://127.0.0.1:5174') {
        throw new Error('Buzón de desarrollo prohibido fuera del entorno local.');
      }
      const inbox = resolve(process.cwd(), '.local', 'mailbox');
      await mkdir(inbox, { recursive: true, mode: 0o700 });
      const record = JSON.stringify({ to: message.to, subject: message.subject, text: message.text }, null, 2);
      await writeFile(resolve(inbox, `${Date.now()}-${randomUUID()}.json`), record, { flag: 'wx', mode: 0o600 });
    }
    const result = this.script(this.records.length + 1, { idempotencyKey: message.idempotencyKey });
    this.records.push(Object.freeze({ kind: result.kind, idempotencyKey: message.idempotencyKey, at: this.now() }));
    return result;
  }
}
