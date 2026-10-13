import { describe, expect, it } from 'vitest';
import { createWorkerLoop } from './worker-loop.js';
import type { OutboxProcessor } from './process-outbox.js';

function harness(options: { claimed?: number; failProcessor?: boolean } = {}) {
  let clock = 0;
  const logs: Array<[string, string, number]> = [];
  let expires = 0;
  const processor = {
    runOnce: async () => {
      if (options.failProcessor) throw new Error('canario-secreto');
      clock += 5;
      return { claimed: options.claimed ?? 0, sent: 0, failed: 0, retried: 0, skipped: 0 };
    },
  } as unknown as OutboxProcessor;
  const loop = createWorkerLoop({
    processor, gateway: { expire: async () => { expires += 1; return { expired: 0, exhausted: 0 }; } }, pollMs: 1000, expireEveryMs: 60_000,
    now: () => clock, log: (event, code, durationMs) => logs.push([event, code, durationMs]),
  });
  return { loop, logs, expires: () => expires, advance: (ms: number) => { clock += ms; } };
}

describe('bucle del worker', () => {
  it('un ciclo con trabajo registra OK y sin trabajo SIN_TRABAJO, solo con evento, código y duración', async () => {
    const busy = harness({ claimed: 3 });
    const idle = harness();

    await busy.loop.tick();
    await idle.loop.tick();

    expect(busy.logs).toEqual([['worker.ciclo', 'OK', 5]]);
    expect(idle.logs).toEqual([['worker.ciclo', 'SIN_TRABAJO', 5]]);
  });

  it('vence el outbox en el primer ciclo y luego cada 60 s, no en cada ciclo', async () => {
    const { loop, expires, advance } = harness();

    await loop.tick();
    await loop.tick();
    expect(expires()).toBe(1);
    advance(61_000);
    await loop.tick();

    expect(expires()).toBe(2);
  });

  it('un fallo del ciclo se registra por código sin mensaje y no lanza', async () => {
    const { loop, logs } = harness({ failProcessor: true });

    await expect(loop.tick()).resolves.toBeUndefined();

    expect(logs).toEqual([['worker.error', 'INTERNAL_ERROR', 0]]);
    expect(JSON.stringify(logs)).not.toContain('canario');
  });

  it('start y stop programan y detienen el bucle sin ciclos solapados', async () => {
    const { loop } = harness();

    loop.start();
    loop.start();
    loop.stop();

    await expect(loop.tick()).resolves.toBeUndefined();
  });
});
