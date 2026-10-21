import type { ReactNode } from 'react';
import { Brand } from '../../../components/layout/Brand.js';
import { cx } from '../../../components/ui/cx.js';

export type AuthShellProps = {
  asideTitle: string;
  asideDetail: string;
  asideContent?: ReactNode;
  asideFooter?: ReactNode;
  wideAside?: boolean;
  children: ReactNode;
};

// Composición «+» de las vistas de acceso (AUTH-01 a AUTH-04): aside petróleo
// con marca y contexto, y la tarjeta de la vista en la columna principal. El
// título del aside es un párrafo destacado; el h1 de la vista va en la tarjeta.
export function AuthShell({ asideTitle, asideDetail, asideContent, asideFooter, wideAside = false, children }: AuthShellProps) {
  return (
    <div
      className={cx(
        'grid min-h-screen bg-canvas',
        wideAside ? 'lg:grid-cols-[540px_minmax(0,1fr)]' : 'lg:grid-cols-[400px_minmax(0,1fr)]',
      )}
    >
      <aside className="flex flex-col gap-8 bg-petrol px-6 py-8 text-white sm:px-12 lg:py-12">
        <Brand tone="dark" />
        <div className={cx('flex flex-col gap-4', wideAside ? 'lg:mt-24' : 'lg:mt-12')}>
          <p
            className={cx(
              'leading-tight',
              wideAside ? 'font-editorial text-4xl font-medium sm:text-5xl' : 'text-4xl font-bold',
            )}
          >
            {asideTitle}
          </p>
          <p className="text-white/85">{asideDetail}</p>
        </div>
        {asideContent}
        {asideFooter && <div className="lg:mt-auto">{asideFooter}</div>}
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}

export function AuthCard({ labelledBy, children, className }: { labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cx(
        'flex w-full max-w-[836px] flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-12',
        className,
      )}
    >
      {children}
    </section>
  );
}
