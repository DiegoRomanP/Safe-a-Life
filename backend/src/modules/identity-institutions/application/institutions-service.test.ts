import { describe, expect, it } from 'vitest';
import { createInstitutionsService } from './institutions-service.js';
import type { Envelope, InstitutionsRepository } from './institutions.ports.js';

function recorder() {
  const seen: Array<{ method: string; envelope?: Envelope; args: unknown[] }> = [];
  const repository = new Proxy({}, {
    get: (_target, method: string) => async (_token: string, ...args: unknown[]) => {
      const first = args[0] as Envelope | undefined;
      seen.push({ method, ...(first && typeof first === 'object' && 'hash' in first ? { envelope: first } : {}), args });
      return { ok: true };
    },
  }) as unknown as InstitutionsRepository;
  return { seen, service: createInstitutionsService(repository) };
}

describe('hash canónico de las escrituras (paridad con app.fingerprint de SQL)', () => {
  it('createHospital coincide con el hash fijo que verifica pgTAP', async () => {
    const { seen, service } = recorder();

    await service.createHospital('t', 'clave-de-prueba-0001', { publicName: 'Hospital Ñandú "X" 🩸', legalName: 'Razón Social S.A.' });

    expect(seen[0].envelope).toEqual({
      key: 'clave-de-prueba-0001',
      hash: '077e34c4d41124bee1d755df3cd46b6dc5a216388228bf6fe3900a0c69f94ca0',
    });
  });

  it('updateHospital envía null por cada campo ausente (sin cambio)', async () => {
    const { seen, service } = recorder();

    await service.updateHospital('t', 'clave-de-prueba-0001', '0f8fad5b-d9cb-469f-a165-70867728950e', { isAuthorized: true });

    expect(seen[0].envelope?.hash).toBe('f1ebda4160a323d6ad62c2a7c3275d9b4925345f81eca2d42f1ece916930c386');
  });

  it('setFinalDemoAt normaliza a ISO con milisegundos', async () => {
    const { seen, service } = recorder();

    await service.setFinalDemoAt('t', 'clave-de-prueba-0001', '2030-01-01T00:00:00Z');

    expect(seen[0].envelope?.hash).toBe('5a487812717d6e8dd4baf67f1284cf7efe0b01ff6c46edec2f5efc4c94b0d829');
    expect(seen[0].args[1]).toBe('2030-01-01T00:00:00.000Z');
  });

  it('las coordenadas entran al hash como texto y su ausencia como null', async () => {
    const { seen, service } = recorder();
    const siteId = '0f8fad5b-d9cb-469f-a165-70867728950e';

    await service.updateHospitalSite('t', 'clave-de-prueba-0001', siteId, { coordinates: { latitude: -12.046374, longitude: -77.042793 } });
    await service.updateHospitalSite('t', 'clave-de-prueba-0001', siteId, { isActive: false });
    await service.createHospitalSite('t', 'clave-de-prueba-0001', siteId, {
      publicName: 'Sede', publicAddress: 'Lima', coordinates: { latitude: -12.046374, longitude: -77.042793 },
    });

    const hashes = seen.map(({ envelope }) => envelope?.hash);
    expect(new Set(hashes).size).toBe(3);
    hashes.forEach((hash) => expect(hash).toMatch(/^[0-9a-f]{64}$/));
  });

  it('revokeMembership fija status revocada en el hash', async () => {
    const { seen, service } = recorder();

    await service.revokeMembership('t', 'clave-de-prueba-0001', '0f8fad5b-d9cb-469f-a165-70867728950e', 'Baja del personal');
    await service.revokeMembership('t', 'clave-de-prueba-0001', '0f8fad5b-d9cb-469f-a165-70867728950e', 'Otro motivo');

    expect(seen[0].envelope?.hash).not.toBe(seen[1].envelope?.hash);
  });

  it('una fecha date-time válida para el esquema pero inexistente para Date (segundo intercalar) es 422, no 500', async () => {
    const { seen, service } = recorder();

    await expect(service.setFinalDemoAt('t', 'clave-de-prueba-0001', '2027-06-30T23:59:60Z')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    // El rechazo ocurre antes de tocar el repositorio (y por tanto antes de reclamar la clave de idempotencia).
    expect(seen).toEqual([]);
  });
});
