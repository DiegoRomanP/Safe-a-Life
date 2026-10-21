import { Link, type LinkProps } from 'react-router-dom';
import { buttonClass, type ButtonVariant } from './Button.js';

export type LinkButtonProps = LinkProps & { variant?: ButtonVariant; fullWidth?: boolean };

// Navegación con aspecto de botón. Se usa un enlace, no un <button>, porque
// cambia de página en lugar de ejecutar una acción.
export function LinkButton({ variant = 'primary', fullWidth = false, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, fullWidth, typeof className === 'string' ? className : undefined)} {...props} />;
}
