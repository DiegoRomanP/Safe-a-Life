import type { DemoScenario } from '../../lib/demoApi.js';
import { cx } from '../ui/cx.js';

const demoScenarioLabel: Record<DemoScenario, string> = {
  normal: 'Normal',
  cargando: 'Cargando',
  error: 'Error de red',
  sin_permiso: 'Sin permiso',
  conflicto: 'Conflicto al guardar',
};

const scenarios = Object.keys(demoScenarioLabel) as DemoScenario[];

export type DevScenarioPickerProps = { value: DemoScenario; onChange: (scenario: DemoScenario) => void };

// Solo para desarrollo: fuerza cómo responde la capa de datos demo para ver
// cada estado (carga, error, sin permiso, conflicto) sin backend (D-4). Quien
// lo usa lo monta únicamente cuando import.meta.env.DEV es true.
export function DevScenarioPicker({ value, onChange }: DevScenarioPickerProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-muted bg-surface p-2">
      <legend className="sr-only">Escenario de datos (solo desarrollo)</legend>
      <span aria-hidden="true" className="px-2 text-sm font-semibold text-muted">
        Datos de desarrollo:
      </span>
      {scenarios.map((scenario) => (
        <label
          key={scenario}
          className={cx(
            'cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
            value === scenario ? 'bg-petrol text-white' : 'text-ink hover:bg-neutral-soft',
          )}
        >
          <input
            type="radio"
            name="escenario-datos"
            value={scenario}
            checked={value === scenario}
            onChange={() => onChange(scenario)}
            className="sr-only"
          />
          {demoScenarioLabel[scenario]}
        </label>
      ))}
    </fieldset>
  );
}
