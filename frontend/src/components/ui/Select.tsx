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
  return (
    <select className={cx(controlClass, invalid ? 'border-danger' : 'border-line', className)} {...props}>
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
