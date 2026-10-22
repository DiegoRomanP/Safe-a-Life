import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type HeadingLevel = 2 | 3 | 4;

export type CardProps = {
  title?: string;
  headingLevel?: HeadingLevel;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

// Superficie blanca con borde fino y radio 12 (Penpot). El nivel del título lo
// elige la página para mantener una jerarquía de encabezados correcta.
export function Card({ title, headingLevel = 2, actions, children, className }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-6', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <Heading className="text-xl font-semibold text-ink">{title}</Heading>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
