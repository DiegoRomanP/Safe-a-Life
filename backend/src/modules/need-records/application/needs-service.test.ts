import { describe, expect, it } from 'vitest';
import { createNeedsService } from './needs-service.js';
import type { Envelope, NeedsRepository } from './needs.ports.js';

function recorder() {
  const seen: Array<{ method: string; envelope?: Envelope; args: unknown[] }> = [];
  const repository = new Proxy({}, {
    get: (_target, method: string) => async (_token: string, ...args: unknown[]) => {
      const first = args[0] as Envelope | undefined;
      seen.push({ method, ...(first && typeof first === 'object' && 'hash' in first ? { envelope: first } : {}), args });
      return { ok: true };
    },
  }) as unknown as NeedsRepository;
  return { seen, service: createNeedsService(repository) };
}

describe('hash canónico de la transición (paridad con app.fingerprint de SQL)', () => {
  it('coincide con el valor fijo que verifica pgTAP', async () => {
    const { seen, service } = recorder();

    await service.transition('t', 'clave-de-prueba-0001', '50000000-0000-4000-8000-0000000000e1', 'cerrada');

    expect(seen[0].envelope).toEqual({
      key: 'clave-de-prueba-0001',
      hash: '18ffa36e367154a78c13193efa0e635f074f64d34607a59ba9790e8bd0a4d8fe',
    });
  });

  it('el UUID en mayúsculas produce el mismo hash que en minúsculas (la RPC lo recibe como uuid)', async () => {
    const { seen, service } = recorder();

    await service.transition('t', 'clave-de-prueba-0001', 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF', 'activa');
    await service.transition('t', 'clave-de-prueba-0001', 'abcdefab-cdef-4abc-8def-abcdefabcdef', 'activa');

    expect(seen[0].envelope?.hash).toBe(seen[1].envelope?.hash);
  });

  it('un destino distinto o una necesidad distinta cambian el hash', async () => {
    const { seen, service } = recorder();

    await service.transition('t', 'clave-de-prueba-0001', '50000000-0000-4000-8000-0000000000e1', 'cerrada');
    await service.transition('t', 'clave-de-prueba-0001', '50000000-0000-4000-8000-0000000000e1', 'cancelada');
    await service.transition('t', 'clave-de-prueba-0001', '50000000-0000-4000-8000-0000000000e2', 'cerrada');

    expect(new Set(seen.map((call) => call.envelope?.hash)).size).toBe(3);
  });
});

describe('lecturas', () => {
  it('delegan en el repositorio con el token del actor y sin transformar la consulta', async () => {
    const { seen, service } = recorder();
    const query = { limit: 5, cursor: null, status: 'activa' as const };

    await service.list('token-1', query);
    await service.get('token-1', '50000000-0000-4000-8000-0000000000e1');

    expect(seen.map((call) => call.method)).toEqual(['list', 'get']);
    expect(seen[0].args[0]).toBe(query);
  });
});
