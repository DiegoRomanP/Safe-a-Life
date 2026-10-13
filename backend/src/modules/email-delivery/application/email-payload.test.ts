import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SealedPayloadError, type OutboxKeyring } from '../../../shared/crypto/outbox-cipher.js';
import { openEmailPayload, renderEmail, sealEmailPayload } from './email-payload.js';

const KEYRING: OutboxKeyring = { currentKid: 'k1', keys: new Map([['k1', randomBytes(32)]]) };
const ID = '60000000-0000-4000-8000-000000000001';
const TOKEN = 'tok_canario_abcdefghijklmnop0123456789';

describe('payload cifrado del correo', () => {
  it('ida y vuelta con el id del outbox como AAD', () => {
    const sealed = sealEmailPayload(KEYRING, ID, { recipient: 'd@example.test', token: TOKEN, hospitalName: 'Hospital Demo' });

    expect(openEmailPayload(KEYRING, ID, sealed)).toEqual({ recipient: 'd@example.test', token: TOKEN, hospitalName: 'Hospital Demo' });
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain('d@example.test');
  });

  it('no abre en otro outbox y rechaza formas inválidas con un error genérico', () => {
    const sealed = sealEmailPayload(KEYRING, ID, { token: TOKEN });

    expect(() => openEmailPayload(KEYRING, '60000000-0000-4000-8000-000000000002', sealed)).toThrow(SealedPayloadError);
    for (const bad of [{ token: 1 }, { token: TOKEN, extra: 'x' }, { token: TOKEN, recipient: 'no-es-correo' }, { recipient: 'd@example.test' }, [], 'texto']) {
      const forged = sealEmailPayload(KEYRING, ID, bad as never);
      expect(() => openEmailPayload(KEYRING, ID, forged)).toThrow(SealedPayloadError);
    }
  });

  it('renderEmail exige los datos de cada tipo y arma el enlace del tipo correcto', () => {
    const base = { token: TOKEN };

    expect(renderEmail('verificacion_email', base, 'https://app.example.test').text).toContain(`https://app.example.test/verificar-correo#${TOKEN}`);
    expect(renderEmail('cambio_email', base, 'https://app.example.test').text).toContain('/cambiar-correo#');
    expect(renderEmail('alta_asistida', { ...base, hospitalName: 'H' }, 'https://app.example.test').text).toContain('/activar-cuenta#');
    expect(renderEmail('invitacion_admin', { ...base, hospitalName: 'H' }, 'https://app.example.test').text).toContain('/invitacion-administrador#');
    expect(renderEmail('invitacion', { ...base, hospitalName: 'H', sitePublicName: 'S', deadline: 'mañana' }, 'https://app.example.test').text).toContain('/invitaciones#');
    expect(() => renderEmail('invitacion', base, 'https://app.example.test')).toThrow(SealedPayloadError);
    expect(() => renderEmail('alta_asistida', base, 'https://app.example.test')).toThrow(SealedPayloadError);
  });
});
