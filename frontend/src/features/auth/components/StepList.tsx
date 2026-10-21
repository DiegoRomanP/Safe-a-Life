import { cx } from '../../../components/ui/cx.js';

export type StepListProps = { steps: string[]; current: number; label: string };

// Pasos del aside petróleo (Penpot, AUTH-02 «+»). El paso actual y los ya
// hechos van en círculo blanco; los pendientes, en petróleo claro.
// aria-current marca el paso actual para lectores de pantalla.
export function StepList({ steps, current, label }: StepListProps) {
  return (
    <ol aria-label={label} className="flex flex-col gap-6">
      {steps.map((step, index) => {
        const number = index + 1;
        const active = number <= current;
        return (
          <li key={step} aria-current={number === current ? 'step' : undefined} className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className={cx(
                'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                active ? 'bg-surface text-petrol' : 'bg-white/15 text-white',
              )}
            >
              {number}
            </span>
            <span className={cx(number === current ? 'font-bold' : 'text-white/85')}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
