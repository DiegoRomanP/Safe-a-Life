// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('PUB-01 Inicio público', () => {
  it('tiene un solo h1 con el mensaje principal', () => {
    const view = renderRoute('/');
    const headings = view.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Conectamos necesidades hospitalarias con personas dispuestas a ayudar.');
  });

  it('la cabecera pública ofrece Ingresar y Registrarme dentro de un nav con nombre', () => {
    const nav = renderRoute('/').querySelector('nav[aria-label="Principal"]');
    const links = [...(nav?.querySelectorAll('a') ?? [])].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Cómo funciona', '/#como-funciona'],
      ['Ingresar', '/ingresar'],
      ['Registrarme', '/registro'],
    ]);
  });

  it('describe los tres pasos en una lista ordenada', () => {
    const steps = renderRoute('/').querySelectorAll('#como-funciona ol > li');
    expect([...steps].map((li) => li.querySelector('p')?.textContent)).toEqual([
      'El hospital publica',
      'El sistema preselecciona',
      'Tú decides',
    ]);
  });

  it('aclara que es un prototipo académico sin promesas clínicas', () => {
    const text = renderRoute('/').textContent ?? '';
    expect(text).toContain('Trabaja únicamente con datos sintéticos y no determina elegibilidad médica.');
    expect(text).toContain('Confirmar significa intención de asistir.');
  });
});
