import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { authRenewalPolicy } from './renewal-policy.js';

const request = (method: string, path: string) => ({ method, path }) as Request;

describe('authRenewalPolicy', () => {
  it('el login nunca renueva, también con barra final o mayúsculas', () => {
    expect(authRenewalPolicy(request('POST', '/v1/auth/sessions'))).toBe('skip');
    expect(authRenewalPolicy(request('POST', '/v1/auth/sessions/'))).toBe('skip');
    expect(authRenewalPolicy(request('POST', '/V1/Auth/Sessions'))).toBe('skip');
  });

  it('el logout renueva sin que un límite lo bloquee, también con variantes de ruta', () => {
    expect(authRenewalPolicy(request('DELETE', '/v1/auth/sessions/current'))).toBe('lenient');
    expect(authRenewalPolicy(request('DELETE', '/v1/auth/sessions/current/'))).toBe('lenient');
    expect(authRenewalPolicy(request('DELETE', '/V1/AUTH/SESSIONS/CURRENT'))).toBe('lenient');
  });

  it('el resto de rutas y métodos renueva con normalidad', () => {
    expect(authRenewalPolicy(request('GET', '/v1/auth/sessions'))).toBe('normal');
    expect(authRenewalPolicy(request('GET', '/v1/auth/session'))).toBe('normal');
    expect(authRenewalPolicy(request('POST', '/v1/auth/sessions/current'))).toBe('normal');
    expect(authRenewalPolicy(request('DELETE', '/v1/hospitals'))).toBe('normal');
  });
});
