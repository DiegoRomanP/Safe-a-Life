import { Link } from 'react-router-dom';
import { cx } from '../ui/cx.js';

export type BrandProps = { tone?: 'light' | 'dark'; className?: string };

// Marca de Penpot: cuadro granate de radio 10 con «+» y el nombre. Enlaza al
// inicio. En fondos petróleo (tone="dark") el nombre va en blanco.
export function Brand({ tone = 'light', className }: BrandProps) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-3 rounded-lg', className)}>
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-[10px] bg-brand text-2xl leading-none font-bold text-white"
      >
        +
      </span>
      <span className={cx('text-2xl font-bold', tone === 'dark' ? 'text-white' : 'text-ink')}>Save a Life</span>
    </Link>
  );
}
