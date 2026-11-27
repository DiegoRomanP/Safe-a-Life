import { Link } from 'react-router-dom';
import { cx } from '../ui/cx.js';

export type BrandProps = { tone?: 'light' | 'dark'; className?: string };

// Marca: logo (gota con cruz sobre cuadro granate) y el nombre. Enlaza al
// inicio. En fondos petróleo (tone="dark") el nombre y el foco van en blanco,
// porque el azul de foco no contrasta con el petróleo (Frontend-Design.md).
export function Brand({ tone = 'light', className }: BrandProps) {
  return (
    <Link
      to="/"
      className={cx(
        'inline-flex items-center gap-3 rounded-lg',
        tone === 'dark' && 'focus-visible:outline-white',
        className,
      )}
    >
      {/* Mismo archivo que el favicon: gota con la cruz sobre el granate de la marca. */}
      <img src="/favicon.svg" alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0" />
      <span className={cx('text-2xl font-bold', tone === 'dark' ? 'text-white' : 'text-ink')}>Save a Life</span>
    </Link>
  );
}
