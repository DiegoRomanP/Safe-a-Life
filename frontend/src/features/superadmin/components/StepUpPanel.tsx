import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { useSuperadmin } from '../SuperadminContext.js';

const CODE_SHAPE = /^[0-9]{6,8}$/;

export type StepUpPanelProps = { purpose: string; onVerified: () => void; onCancel: () => void };

// Verificación reforzada antes de una acción privilegiada (POST /auth/step-up-verifications, código de 6 a 8 dígitos).
// Recibe el foco al aparecer. El backend decide si el código vale: aquí solo se valida su forma.
export function StepUpPanel({ purpose, onVerified, onCancel }: StepUpPanelProps) {
  const { verifyStepUp } = useSuperadmin();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => codeRef.current?.focus(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const clean = code.replace(/\s/g, '');
    const found = CODE_SHAPE.test(clean) ? undefined : 'Ingresa el código numérico de 6 a 8 dígitos de tu aplicación.';
    flushSync(() => setError(found));
    if (found) return codeRef.current?.focus();
    inFlight.current = true;
    setBusy(true);
    const outcome = await verifyStepUp(clean);
    inFlight.current = false;
    setBusy(false);
    if (outcome === 'ok') return onVerified();
    setCode('');
    flushSync(() => setError(outcome === 'incorrecto' ? 'El código es incorrecto o venció. Escribe el código vigente.' : 'No pudimos verificar el código. Intenta de nuevo.'));
    codeRef.current?.focus();
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
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4 sm:max-w-[420px]">
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
          <Button type="submit" aria-disabled={busy} aria-busy={busy}>Verificar y continuar</Button>
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
  const { stepUpValid } = useSuperadmin();
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
