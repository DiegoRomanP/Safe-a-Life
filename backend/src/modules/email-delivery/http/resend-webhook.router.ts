import express, { type Express } from 'express';
import { ApiError } from '../../../shared/http/errors.js';
import type { WebhookIngester } from '../application/ingest-webhook.js';

const RAW_LIMIT = '64kb';

/**
 * `POST /api/v1/email-delivery/webhooks/resend`: público y sin cookie; la autenticidad la da la firma. Se monta
 * ANTES de `express.json` porque la firma exige el cuerpo crudo. Un cuerpo que no llegó como Buffer (otro
 * Content-Type) es 400; una firma inválida o vencida es 401 sin detalle; un evento ignorado también es 204.
 */
export function registerResendWebhookRoutes(app: Express, { ingester }: Readonly<{ ingester: WebhookIngester }>): void {
  app.post('/api/v1/email-delivery/webhooks/resend', express.raw({ type: 'application/json', limit: RAW_LIMIT }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || Object.keys(req.query).length > 0) throw new ApiError('BAD_REQUEST');
    const result = await ingester.handle(
      { id: req.get('svix-id'), timestamp: req.get('svix-timestamp'), signature: req.get('svix-signature') },
      req.body,
    );
    if (result === 'invalid_signature') {
      res.locals.rejectReason = 'webhook_signature';
      throw new ApiError('AUTHENTICATION_REQUIRED');
    }
    if (result === 'bad_request') throw new ApiError('BAD_REQUEST');
    res.status(204).end();
  });
}
