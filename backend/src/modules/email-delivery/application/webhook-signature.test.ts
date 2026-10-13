import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EVENT_TO_DELIVERY, WEBHOOK_TOLERANCE_SECONDS, signWebhook, verifyWebhook } from './webhook-signature.js';

const SECRET = Buffer.alloc(32, 7);
const BODY = Buffer.from('{"type":"email.delivered","data":{"email_id":"abc"}}');
const NOW = 1_760_000_000;
const ID = 'msg_sintetico_0001';

const signed = (timestamp = NOW, body = BODY) => `v1,${signWebhook(SECRET, ID, String(timestamp), body)}`;
const check = (overrides: Partial<{ id: string; timestamp: string; signature: string; body: Buffer; now: number }> = {}) =>
  verifyWebhook(SECRET, {
    id: overrides.id ?? ID, timestamp: overrides.timestamp ?? String(NOW), signature: overrides.signature ?? signed(),
  }, overrides.body ?? BODY, overrides.now ?? NOW);

describe('firma del webhook (estilo Svix)', () => {
  it('acepta una firma válida', () => {
    expect(check()).toBe(true);
  });

  it('coincide con el vector de la documentación de Svix (HMAC-SHA256 base64 sobre id.timestamp.cuerpo)', () => {
    // Vector independiente: HMAC calculado a mano con el mismo esquema (no con signWebhook).
    const expected = createHmac('sha256', SECRET).update(`${ID}.${NOW}.${BODY.toString('utf8')}`).digest('base64');

    expect(signed()).toBe(`v1,${expected}`);
  });

  it('rechaza un cuerpo alterado, un id distinto o una marca de tiempo distinta', () => {
    expect(check({ body: Buffer.from('{"type":"email.bounced","data":{"email_id":"abc"}}') })).toBe(false);
    expect(check({ id: 'msg_otro' })).toBe(false);
    expect(check({ timestamp: String(NOW + 1), signature: signed() })).toBe(false);
  });

  it('rechaza una firma alterada o con otra versión', () => {
    expect(check({ signature: `${signed().slice(0, -3)}AAA` })).toBe(false);
    expect(check({ signature: signed().replace('v1,', 'v2,') })).toBe(false);
    expect(check({ signature: 'v1,' })).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    const other = `v1,${signWebhook(Buffer.alloc(32, 9), ID, String(NOW), BODY)}`;

    expect(check({ signature: other })).toBe(false);
  });

  it('rechaza una marca de tiempo antigua o futura fuera de 300 s, y acepta justo en el borde', () => {
    expect(check({ now: NOW + WEBHOOK_TOLERANCE_SECONDS + 1 })).toBe(false);
    expect(check({ now: NOW - WEBHOOK_TOLERANCE_SECONDS - 1 })).toBe(false);
    expect(check({ now: NOW + WEBHOOK_TOLERANCE_SECONDS })).toBe(true);
    expect(check({ now: NOW - WEBHOOK_TOLERANCE_SECONDS })).toBe(true);
  });

  it('con varias firmas separadas por espacios basta con que una coincida', () => {
    expect(check({ signature: `v1,${Buffer.from('otra').toString('base64')} ${signed()}` })).toBe(true);
    expect(check({ signature: `${signed()} v1,${Buffer.from('otra').toString('base64')}` })).toBe(true);
    expect(check({ signature: `v1,${Buffer.from('a').toString('base64')} v1,${Buffer.from('b').toString('base64')}` })).toBe(false);
  });

  it.each([
    ['sin id', { id: '' }], ['sin marca de tiempo', { timestamp: '' }], ['marca no numérica', { timestamp: 'ayer' }],
    ['marca negativa', { timestamp: '-5' }], ['sin firma', { signature: '' }],
  ])('rechaza una cabecera inválida (%s)', (_label, overrides) => {
    expect(check(overrides)).toBe(false);
  });

  it('las cabeceras ausentes (undefined) se rechazan sin lanzar', () => {
    expect(verifyWebhook(SECRET, { id: undefined, timestamp: undefined, signature: undefined }, BODY, NOW)).toBe(false);
  });
});

describe('mapeo de eventos', () => {
  it('solo cuatro eventos avanzan el estado', () => {
    expect(EVENT_TO_DELIVERY).toEqual({
      'email.sent': 'enviada', 'email.delivered': 'entregada', 'email.bounced': 'fallida', 'email.failed': 'fallida',
    });
  });
});
