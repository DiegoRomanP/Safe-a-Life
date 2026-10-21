import { cx } from '../../../components/ui/cx.js';
import type { TokenStatus } from './TokenStatusView.js';

const options: Array<{ value: TokenStatus; label: string }> = [
  { value: 'valid', label: 'Válido' },
  { value: 'used', label: 'Usado' },
  { value: 'expired', label: 'Vencido' },
  { value: 'invalid', label: 'Inválido' },
];

export type DevStatusPickerProps = { value: TokenStatus; onChange: (status: TokenStatus) => void };

// Solo para desarrollo: sin backend (D-4) no hay forma de saber el estado del
// enlace. Quien lo usa lo monta únicamente cuando import.meta.env.DEV es true.
export function DevStatusPicker({ value, onChange }: DevStatusPickerProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-muted bg-surface p-2">
      <legend className="sr-only">Estado del enlace (solo desarrollo)</legend>
      <span aria-hidden="true" className="px-2 text-sm font-semibold text-muted">
        Vista de desarrollo:
      </span>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx(
            'cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
            value === option.value ? 'bg-petrol text-white' : 'text-ink hover:bg-neutral-soft',
          )}
        >
          <input
            type="radio"
            name="estado-enlace"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
