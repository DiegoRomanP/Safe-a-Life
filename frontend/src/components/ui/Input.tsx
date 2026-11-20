import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from './cx.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

// Un <select> siempre cumple :read-only, así que el aspecto de solo lectura se acota a input y textarea.
export const controlClass =
  'min-h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-neutral-soft [&:is(input,textarea):read-only]:border-dashed [&:is(input,textarea):read-only]:bg-neutral-soft [&:is(input,textarea):read-only]:text-muted';

// forwardRef permite que un formulario lleve el foco al campo con error.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(controlClass, invalid ? 'border-danger' : 'border-control-border', className)}
      {...props}
    />
  );
});
