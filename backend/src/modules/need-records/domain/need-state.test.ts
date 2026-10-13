import { describe, expect, it } from 'vitest';
import {
  NEED_STATUSES, canTransitionManually, evaluateManualTransition, isTerminal, projectStatus, type NeedStatus,
} from './need-state.js';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const FUTURE = '2026-10-14T12:00:00.000000Z';
const PAST = '2026-10-12T12:00:00.000000Z';

describe('estados terminales', () => {
  it('cerrada, cancelada y vencida son terminales; el resto no', () => {
    const terminal = NEED_STATUSES.filter(isTerminal);

    expect([...terminal].sort()).toEqual(['cancelada', 'cerrada', 'vencida']);
  });
});

describe('matriz manual de transición (C-8)', () => {
  const allowed: ReadonlyArray<readonly [NeedStatus, NeedStatus]> = [
    ['borrador', 'activa'], ['borrador', 'cancelada'],
    ['activa', 'cerrada'], ['activa', 'cancelada'],
    ['meta_alcanzada', 'cerrada'], ['meta_alcanzada', 'cancelada'],
  ];

  it('permite exactamente las seis transiciones aprobadas', () => {
    const accepted = NEED_STATUSES.flatMap((from) => NEED_STATUSES.filter((to) => canTransitionManually(from, to)).map((to) => [from, to]));

    expect(accepted).toEqual(allowed);
  });

  it('los estados terminales no se reabren hacia ningún destino', () => {
    for (const from of ['cerrada', 'cancelada', 'vencida'] as const) {
      expect(NEED_STATUSES.some((to) => canTransitionManually(from, to))).toBe(false);
    }
  });

  it('meta_alcanzada y vencida no son destinos manuales; activa tampoco desde activa o meta_alcanzada', () => {
    expect(NEED_STATUSES.some((from) => canTransitionManually(from, 'meta_alcanzada'))).toBe(false);
    expect(NEED_STATUSES.some((from) => canTransitionManually(from, 'vencida'))).toBe(false);
    expect(canTransitionManually('activa', 'activa')).toBe(false);
    expect(canTransitionManually('meta_alcanzada', 'activa')).toBe(false);
  });
});

describe('estado proyectado por vencimiento', () => {
  it('un estado no terminal con expires_at <= ahora se proyecta como vencida (también borrador)', () => {
    for (const status of ['borrador', 'activa', 'meta_alcanzada'] as const) {
      expect(projectStatus(status, PAST, NOW)).toBe('vencida');
      expect(projectStatus(status, NOW.toISOString(), NOW)).toBe('vencida');
      expect(projectStatus(status, FUTURE, NOW)).toBe(status);
    }
  });

  it('un estado terminal conserva su valor aunque haya pasado el plazo', () => {
    expect(projectStatus('cerrada', PAST, NOW)).toBe('cerrada');
    expect(projectStatus('cancelada', PAST, NOW)).toBe('cancelada');
    expect(projectStatus('vencida', FUTURE, NOW)).toBe('vencida');
  });

  it('compara con microsegundos sin redondear a milisegundos', () => {
    expect(projectStatus('activa', '2026-10-13T12:00:00.000001Z', NOW)).toBe('activa');
  });
});

describe('evaluación de una transición manual', () => {
  it('acepta borrador → activa solo antes del vencimiento', () => {
    expect(evaluateManualTransition('borrador', FUTURE, NOW, 'activa')).toEqual({ ok: true });
    expect(evaluateManualTransition('borrador', PAST, NOW, 'activa')).toEqual({ ok: false, reason: 'terminal' });
  });

  it('un estado almacenado no terminal que ya venció es terminal para la transición', () => {
    expect(evaluateManualTransition('activa', PAST, NOW, 'cerrada')).toEqual({ ok: false, reason: 'terminal' });
    expect(evaluateManualTransition('borrador', PAST, NOW, 'cancelada')).toEqual({ ok: false, reason: 'terminal' });
  });

  it('distingue terminal de transición no permitida', () => {
    expect(evaluateManualTransition('cerrada', FUTURE, NOW, 'activa')).toEqual({ ok: false, reason: 'terminal' });
    expect(evaluateManualTransition('borrador', FUTURE, NOW, 'cerrada')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(evaluateManualTransition('activa', FUTURE, NOW, 'activa')).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('acepta cerrar o cancelar una necesidad activa o con meta alcanzada vigente', () => {
    for (const from of ['activa', 'meta_alcanzada'] as const) {
      expect(evaluateManualTransition(from, FUTURE, NOW, 'cerrada')).toEqual({ ok: true });
      expect(evaluateManualTransition(from, FUTURE, NOW, 'cancelada')).toEqual({ ok: true });
    }
  });
});
