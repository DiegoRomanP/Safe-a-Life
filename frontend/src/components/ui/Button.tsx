import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

// Variantes de Penpot (00 - Fundamentos): 44 px de alto, radio 8, borde de 1 px.
const variants: Record<ButtonVariant, string> = {
  primary: 'border-brand bg-brand text-white hover:border-brand-deep hover:bg-brand-deep',
  secondary: 'border-petrol bg-surface text-petrol hover:bg-soft-blue',
  ghost: 'border-line bg-surface text-ink hover:bg-neutral-soft',
  danger: 'border-danger bg-surface text-danger hover:bg-danger-soft',
};

export function buttonClass(variant: ButtonVariant = 'primary', fullWidth = false, className?: string) {
  return cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-base font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
    variants[variant],
    fullWidth && 'w-full',
    className,
  );
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, fullWidth, className)}
      {...props}
    />
  );
}
