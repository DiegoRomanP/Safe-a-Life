// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../test/render.js';
import { Field } from './Field.js';
import { Input } from './Input.js';
import { Select } from './Select.js';

setupRender();

describe('Field con Input', () => {
  it('asocia el label al control', () => {
    const view = render(
      <Field label="Correo">{(control) => <Input {...control} type="email" />}</Field>,
    );
    const input = view.querySelector('input');
    const label = view.querySelector('label');
    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(input?.id).not.toBe('');
  });

  it('enlaza la ayuda con aria-describedby y no marca error', () => {
    const view = render(
      <Field label="Correo" hint="Usaremos este correo para verificar la cuenta.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = view.querySelector('input');
    const message = view.querySelector(`#${CSS.escape(input?.getAttribute('aria-describedby') ?? '')}`);
    expect(message?.textContent).toBe('Usaremos este correo para verificar la cuenta.');
    expect(input?.hasAttribute('aria-invalid')).toBe(false);
    expect(input?.className).toContain('border-line');
  });

  it('en error muestra el mensaje en lugar de la ayuda y marca aria-invalid', () => {
    const view = render(
      <Field label="Vencimiento" hint="En horas" error="Debe estar entre 1 y 72 horas.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = view.querySelector('input');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.className).toContain('border-danger');
    expect(view.textContent).toContain('Debe estar entre 1 y 72 horas.');
    expect(view.textContent).not.toContain('En horas');
  });

  it('indica con texto cuando el campo es obligatorio', () => {
    const view = render(<Field label="Correo" required>{(control) => <Input {...control} />}</Field>);
    expect(view.querySelector('label')?.textContent).toBe('Correo (obligatorio)');
  });

  it('sin ayuda ni error no agrega aria-describedby', () => {
    const view = render(<Field label="Correo">{(control) => <Input {...control} />}</Field>);
    expect(view.querySelector('input')?.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Select', () => {
  it('muestra el placeholder deshabilitado y las opciones', () => {
    const view = render(
      <Field label="Grupo declarado">
        {(control) => (
          <Select
            {...control}
            defaultValue=""
            placeholder="Selecciona una opción"
            options={[
              { value: 'A+', label: 'A+' },
              { value: 'O-', label: 'O-' },
            ]}
          />
        )}
      </Field>,
    );
    const options = [...view.querySelectorAll('option')];
    expect(options.map((option) => option.textContent)).toEqual(['Selecciona una opción', 'A+', 'O-']);
    expect(options[0]?.disabled).toBe(true);
    expect(view.querySelector('select')?.value).toBe('');
  });
});
