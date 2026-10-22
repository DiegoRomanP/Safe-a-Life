import type { EmailMessage, EmailSender, SendResult } from '../application/email-sender.js';

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
    const result = this.script(this.records.length + 1, { idempotencyKey: message.idempotencyKey });
    this.records.push(Object.freeze({ kind: result.kind, idempotencyKey: message.idempotencyKey, at: this.now() }));
    return result;
  }
}
