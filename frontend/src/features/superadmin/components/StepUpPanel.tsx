import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';

const CODE_SHAPE = /^[0-9]{6,8}$/;

export type StepUpPanelProps = { purpose: string; onVerified: () => void; onCancel: () => void };

// Verificación reforzada antes de una acción privilegiada (verifyStepUp, código
// de 6 a 8 dígitos). Recibe el foco al aparecer. Sin backend (D-4) cualquier
// código con forma válida se acepta.
export function StepUpPanel({ purpose, onVerified, onCancel }: StepUpPanelProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => codeRef.current?.focus(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = code.replace(/\s/g, '');
    const found = CODE_SHAPE.test(clean) ? undefined : 'Ingresa el código numérico de 6 a 8 dígitos de tu aplicación.';
    flushSync(() => setError(found));
    if (found) return codeRef.current?.focus();
    onVerified();
  }

  return (
    <section
      aria-labelledby="step-up-titulo"
      className="flex flex-col gap-4 rounded-xl border-2 border-petrol bg-surface p-6"
    >
      <Badge tone="info" className="self-start">
        Verificación reforzada
      </Badge>
      <div className="flex flex-col gap-1">
        <h2 id="step-up-titulo" className="text-xl font-semibold text-ink">
          Verificación requerida
        </h2>
        <p id="step-up-proposito" className="text-muted">
          {`Confirma tu segundo factor para ${purpose}. La verificación vale 5 minutos.`}
        </p>
      </div>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-[420px]">
        <Field label="Código de 6 dígitos" hint="El código cambia cada 30 segundos." error={error}>
          {(control) => (
            <Input
              {...control}
              // El propósito se lee junto al campo, que es lo que recibe el foco.
              aria-describedby={['step-up-proposito', control['aria-describedby']].filter(Boolean).join(' ')}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">Verificar y continuar</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}

type Pending = { purpose: string; run: () => void; trigger: HTMLElement | null };

// Envuelve una acción protegida: si el step-up sigue vigente la ejecuta; si no,
// muestra StepUpPanel y la ejecuta al verificar. Al cancelar, el foco vuelve al
// control que pidió la acción.
export function useStepUpGate(): { requireStepUp: (purpose: string, run: () => void) => void; stepUpPanel: ReactNode } {
  const { stepUpValid, verifyStepUp } = useSuperadminDemo();
  const [pending, setPending] = useState<Pending | null>(null);

  function requireStepUp(purpose: string, run: () => void) {
    if (stepUpValid()) return run();
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending({ purpose, run, trigger });
  }

  const stepUpPanel = pending ? (
    <StepUpPanel
      purpose={pending.purpose}
      onVerified={() => {
        verifyStepUp();
        setPending(null);
        pending.run();
      }}
      onCancel={() => {
        setPending(null);
        if (pending.trigger?.isConnected) pending.trigger.focus();
      }}
    />
  ) : null;

  return { requireStepUp, stepUpPanel };
}
