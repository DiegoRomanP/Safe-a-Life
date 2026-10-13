import { ContractValidationError, compileOperation } from '../../../shared/validation/contract-validator.js';
import type { OutboxGateway } from './outbox.ports.js';
import { EVENT_TO_DELIVERY, verifyWebhook, type SvixHeaders } from './webhook-signature.js';

export type WebhookResult = 'accepted' | 'ignored' | 'invalid_signature' | 'bad_request';

export interface WebhookIngesterDependencies {
  readonly gateway: Pick<OutboxGateway, 'ingestEvent'>;
  readonly secret: Buffer;
  readonly now?: () => number;
}

/**
 * Caso de uso del webhook de Resend (C-1): verifica la firma sobre el cuerpo CRUDO, parsea solo después, valida
 * la forma y registra los eventos que avanzan la entrega. Un evento duplicado (mismo svix-id) no tiene efecto.
 */
export function createWebhookIngester({ gateway, secret, now = Date.now }: WebhookIngesterDependencies) {
  const operation = compileOperation('receiveResendWebhook');

  return Object.freeze({
    async handle(headers: SvixHeaders, rawBody: Buffer): Promise<WebhookResult> {
      if (!verifyWebhook(secret, headers, rawBody, Math.floor(now() / 1000))) return 'invalid_signature';

      let body: { type: string; created_at?: string; data: { email_id: string } };
      try {
        body = operation.parseBody(JSON.parse(rawBody.toString('utf8'))) as typeof body;
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof ContractValidationError) return 'bad_request';
        throw error;
      }

      if (!Object.hasOwn(EVENT_TO_DELIVERY, body.type)) return 'ignored';
      const created = body.created_at === undefined ? Number.NaN : Date.parse(body.created_at);
      await gateway.ingestEvent({
        eventId: headers.id as string,
        providerMessageId: body.data.email_id,
        type: body.type,
        occurredAt: new Date(Number.isNaN(created) ? now() : created),
      });
      return 'accepted';
    },
  });
}

export type WebhookIngester = ReturnType<typeof createWebhookIngester>;
