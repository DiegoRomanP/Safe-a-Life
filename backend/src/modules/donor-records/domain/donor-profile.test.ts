import { describe, expect, it } from 'vitest';
import { DONOR_STATUSES, EDITABLE_DIRECTLY, canActivate, onboardingStatus } from './donor-profile.js';

const COMPLETE = { name: 'Donante Sintético', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: { latitude: -12.046, longitude: -77.043 } };

describe('perfil del donante', () => {
  it('tiene tres estados en orden', () => {
    expect(DONOR_STATUSES).toEqual(['pendiente_verificacion', 'incompleto', 'activo']);
  });

  it('se activa solo con nombre, grupo, disponibilidad y ubicación', () => {
    expect(canActivate(COMPLETE)).toBe(true);
    expect(canActivate({ ...COMPLETE, name: null })).toBe(false);
    expect(canActivate({ ...COMPLETE, name: '   ' })).toBe(false);
    expect(canActivate({ ...COMPLETE, declaredBloodType: null })).toBe(false);
    expect(canActivate({ ...COMPLETE, isAvailable: null })).toBe(false);
    expect(canActivate({ ...COMPLETE, approximateLocation: null })).toBe(false);
  });

  it('isAvailable false cuenta como dato presente', () => {
    expect(canActivate({ ...COMPLETE, isAvailable: false })).toBe(true);
  });

  it('solo la disponibilidad y la ubicación se editan directamente', () => {
    expect([...EDITABLE_DIRECTLY]).toEqual(['isAvailable', 'approximateLocation']);
  });

  it('proyecta el estado de onboarding: incompleto = reclamada_incompleta', () => {
    expect(onboardingStatus('pendiente_verificacion')).toBe('reclamada_incompleta');
    expect(onboardingStatus('incompleto')).toBe('reclamada_incompleta');
    expect(onboardingStatus('activo')).toBe('activa');
  });
});
