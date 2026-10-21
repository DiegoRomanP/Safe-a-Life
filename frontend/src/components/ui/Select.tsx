import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx.js';
import { controlClass } from './Input.js';

export type SelectOption = { value: string; label: string };

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
};

export function Select({ options, placeholder, invalid = false, className, ...props }: SelectProps) {
  // Sin valor inicial, el navegador elegiría la primera opción real. Con
  // placeholder se arranca vacío para exigir una elección explícita.
  const initial =
    placeholder && props.value === undefined && props.defaultValue === undefined ? { defaultValue: '' } : {};
  return (
    <select
      className={cx(controlClass, invalid ? 'border-danger' : 'border-line', className)}
      {...initial}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
