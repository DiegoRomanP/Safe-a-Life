import { useId, type ReactNode } from 'react';
import { cx } from './cx.js';

export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  invalid: boolean;
};

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

// Label arriba, control y una línea de ayuda o de error (Penpot, «Campos y
// mensajes»). El error reemplaza la ayuda y se enlaza con aria-describedby.
export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-muted"> (obligatorio)</span>}
      </label>
      {children({
        id,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
        invalid: Boolean(error),
      })}
      {message && (
        <p id={messageId} className={cx('text-sm', error ? 'text-danger' : 'text-muted')}>
          {message}
        </p>
      )}
    </div>
  );
}
