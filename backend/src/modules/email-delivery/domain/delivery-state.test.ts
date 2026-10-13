import { describe, expect, it } from 'vitest';
import { DELIVERY_STATES, advance, type DeliveryEvent, type DeliveryState } from './delivery-state.js';

describe('estado de entrega (V5 / AP-02)', () => {
  it('avanza pendiente → enviada → entregada', () => {
    expect(advance('pendiente', 'enviada')).toBe('enviada');
    expect(advance('enviada', 'entregada')).toBe('entregada');
    expect(advance('pendiente', 'entregada')).toBe('entregada');
  });

  it('nunca retrocede: un evento anterior o igual no cambia el estado', () => {
    expect(advance('entregada', 'enviada')).toBe('entregada');
    expect(advance('enviada', 'enviada')).toBe('enviada');
    expect(advance('entregada', 'entregada')).toBe('entregada');
  });

  it('delivered antes que sent no retrocede al llegar sent', () => {
    expect(advance(advance('pendiente', 'entregada'), 'enviada')).toBe('entregada');
  });

  it('un rebote o fallo marca fallida salvo que ya esté entregada', () => {
    expect(advance('pendiente', 'fallida')).toBe('fallida');
    expect(advance('enviada', 'fallida')).toBe('fallida');
    expect(advance('entregada', 'fallida')).toBe('entregada');
  });

  it('fallida es final: ningún evento la cambia (solo el reintento manual de F6 la reinicia)', () => {
    for (const event of ['enviada', 'entregada', 'fallida'] as const) expect(advance('fallida', event)).toBe('fallida');
  });

  it('cualquier secuencia de eventos produce un estado alcanzable y es insensible al orden entre sent y delivered', () => {
    const events: readonly DeliveryEvent[] = ['enviada', 'entregada', 'fallida'];
    for (const a of events) for (const b of events) for (const c of events) {
      const state = [a, b, c].reduce<DeliveryState>((current, event) => advance(current, event), 'pendiente');
      expect(DELIVERY_STATES).toContain(state);
    }
    expect(advance(advance('pendiente', 'enviada'), 'entregada')).toBe(advance(advance('pendiente', 'entregada'), 'enviada'));
  });
});
