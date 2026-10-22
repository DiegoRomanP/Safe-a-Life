import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { formatDateTime } from '../../../lib/format.js';
import { ResultNotice, type Notice } from '../components/ResultNotice.js';
import { useStepUpGate } from '../components/StepUpPanel.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';

/** «2026-09-30T18:00» (hora de Lima, UTC−5 fijo) → ISO en UTC. */
function limaLocalToIso(value: string): string {
  return new Date(`${value}:00-05:00`).toISOString();
}

// SA-06 Configuración (Penpot «+»). getSuperadminConfiguration solo entrega
// finalDemoAt e isImmutable; setFinalDemoAt exige step-up y no permite cambiar
// la fecha una vez fijada. Los demás parámetros de Penpot (matriz, entorno,
// límites) no están en el contrato y no se muestran. Sin backend (D-4).
export function ConfigurationPage() {
  const { configuration, setFinalDemoAt } = useSuperadminDemo();
  const { requireStepUp, stepUpPanel } = useStepUpGate();
  const [value, setValue] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; confirm?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      date: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? undefined : 'Indica la fecha y la hora final de la demo.',
      confirm: confirmed ? undefined : 'Confirma que entiendes que la fecha no se podrá cambiar.',
    };
    flushSync(() => setErrors(found));
    if (found.date) return dateRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();
    const iso = limaLocalToIso(value);
    requireStepUp('fijar la fecha final de la demo', () => {
      setFinalDemoAt(iso);
      setNotice({ message: 'Fecha final guardada', detail: `${formatDateTime(iso)}. Ya no se puede modificar.` });
    });
  }

  return (
    <>
      <PageHeader title="Configuración versionada" description="Administra parámetros permitidos sin introducir reglas clínicas." />
      <Alert tone="warning" title="Configuración crítica">
        La fecha final de la demo solo puede fijarse una vez y determina la purga posterior.
      </Alert>
      {stepUpPanel}
      <ResultNotice notice={notice} />

      <Card title="Fecha final de la demo">
        {configuration.isImmutable && configuration.finalDemoAt ? (
          <div className="flex flex-col gap-3">
            <Badge tone="info" className="self-start">
              Inmutable
            </Badge>
            <p className="text-lg font-semibold text-ink">{formatDateTime(configuration.finalDemoAt)}</p>
            <p className="text-sm text-muted">La fecha ya está fijada y no admite cambios.</p>
          </div>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6 sm:max-w-[560px]">
            <Field label="Fecha y hora final (Lima, UTC−5)" hint="Una vez guardada será inmutable." error={errors.date} required>
              {(control) => (
                <Input
                  {...control}
                  ref={dateRef}
                  type="datetime-local"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 text-ink">
                <input
                  ref={confirmRef}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  aria-invalid={errors.confirm ? true : undefined}
                  aria-describedby={errors.confirm ? 'confirmar-fecha-error' : undefined}
                  className="mt-1 size-4 accent-petrol"
                />
                <span>Entiendo que la fecha final no se podrá cambiar después de guardarla.</span>
              </label>
              {errors.confirm && (
                <p id="confirmar-fecha-error" className="text-sm text-danger">
                  {errors.confirm}
                </p>
              )}
            </div>
            <div>
              <Button type="submit">Guardar fecha final</Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
