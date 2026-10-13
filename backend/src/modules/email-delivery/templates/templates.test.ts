import { describe, expect, it } from 'vitest';
import { EMAIL_KINDS, actionLink, renderTemplate, type EmailKind } from './index.js';
import { ACADEMIC_DISCLAIMER, INTENT_NOTICE } from './common.js';

const TOKEN = 'tok_canario_abcdefghijklmnop0123456789';
const LINK = `https://app.example.test/invitaciones#${TOKEN}`;

const SAMPLES: { readonly [K in EmailKind]: Parameters<typeof renderTemplate<K>>[1] } = {
  invitacion: { hospitalName: 'Hospital Demo Uno', sitePublicName: 'Sede Central Uno', deadline: '14 de octubre de 2026, 12:00 UTC', link: LINK },
  verificacion_email: { link: LINK },
  alta_asistida: { hospitalName: 'Hospital Demo Uno', link: LINK },
  cambio_email: { link: LINK },
  recuperacion: { link: LINK },
  invitacion_admin: { hospitalName: 'Hospital Demo Uno', link: LINK },
};

describe('plantillas de correo', () => {
  it.each(EMAIL_KINDS)('%s: devuelve asunto, texto y html con el enlace en el cuerpo y nunca en el asunto', (kind) => {
    const email = renderTemplate(kind, SAMPLES[kind] as never);

    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.text).toContain(LINK);
    expect(email.html).toContain(LINK);
    expect(email.subject).not.toContain(TOKEN);
    expect(email.subject).not.toMatch(/https?:|#/);
  });

  it.each(EMAIL_KINDS)('%s: incluye el disclaimer académico y no contiene datos prohibidos', (kind) => {
    const email = renderTemplate(kind, SAMPLES[kind] as never);
    const all = `${email.subject}\n${email.text}\n${email.html}`;

    expect(email.text).toContain(ACADEMIC_DISCLAIMER);
    expect(all).not.toMatch(/\b(O|A|B|AB)[+-]\b|O_NEG|AB_POS|grupo sangu|tipo de sangre/i);
    expect(all).not.toMatch(/latitud|longitud|-12\.\d|kil[oó]metro|distancia|paciente|cirug|transfusi[oó]n segura|reconocimiento/i);
  });

  it('la invitación aclara que confirmar es una intención y solo menciona hospital, sede y plazo', () => {
    const email = renderTemplate('invitacion', SAMPLES.invitacion);

    expect(email.text).toContain(INTENT_NOTICE);
    expect(email.text).toContain('Hospital Demo Uno');
    expect(email.text).toContain('Sede Central Uno');
    expect(email.text).toContain('14 de octubre de 2026');
  });

  it('escapa el HTML de los datos (nombres de hospital y sede) para evitar inyección', () => {
    const email = renderTemplate('invitacion', { ...SAMPLES.invitacion, hospitalName: '<script>alert(1)</script>', sitePublicName: 'A & "B"' });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('A &amp; &quot;B&quot;');
  });

  it('las salidas están congeladas y no dependen del reloj (misma entrada, misma salida)', () => {
    const a = renderTemplate('recuperacion', SAMPLES.recuperacion);
    const b = renderTemplate('recuperacion', SAMPLES.recuperacion);

    expect(Object.isFrozen(a)).toBe(true);
    expect(a).toEqual(b);
  });
});

describe('actionLink', () => {
  it('pone el token en el fragmento, no en la ruta ni en la query', () => {
    const link = actionLink('https://app.example.test/', '/invitaciones', TOKEN);

    expect(link).toBe(`https://app.example.test/invitaciones#${TOKEN}`);
    expect(new URL(link).search).toBe('');
    expect(new URL(link).pathname).toBe('/invitaciones');
  });

  it.each([['corto'], ['con espacios y símbolos <>'], ['a'.repeat(300)]])('rechaza un token inválido (%s)', (token) => {
    expect(() => actionLink('https://app.example.test', '/invitaciones', token)).toThrow(RangeError);
  });

  it('rechaza una ruta fuera de la lista', () => {
    expect(() => actionLink('https://app.example.test', '/admin' as never, TOKEN)).toThrow(RangeError);
  });
});
