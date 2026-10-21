import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Brand } from '../../../components/layout/Brand.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';

// El contrato acepta de 6 a 8 dígitos (verifyMfaChallenge, verifyStepUp).
const CODE_SHAPE = /^[0-9]{6,8}$/;

// AUTH-05 MFA y step-up (Penpot «+»). Sin backend (D-4) no se verifica nada:
// al enviar un código con forma válida se avisa en una región aria-live.
export function VerifyIdentityPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = code.replace(/\s/g, '');
    const found = CODE_SHAPE.test(clean) ? undefined : 'Ingresa el código de 6 dígitos de tu aplicación.';
    flushSync(() => setError(found));
    if (found) return codeRef.current?.focus();
    setCode('');
    setAttempted(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-10">
        <Brand />
        <Badge tone="info">Acceso administrativo</Badge>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <section
          aria-labelledby="mfa-titulo"
          className="flex w-full max-w-[656px] flex-col items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-12 text-center sm:px-12"
        >
          <span
            aria-hidden="true"
            className="flex size-28 items-center justify-center rounded-full bg-soft-blue text-5xl font-bold text-petrol"
          >
            ✓
          </span>
          <h1 id="mfa-titulo" className="text-3xl font-bold text-ink">
            Verifica tu identidad
          </h1>
          <p className="max-w-[528px] text-muted">
            Esta acción requiere autenticación reforzada reciente. Ingresa el código de tu aplicación autenticadora.
          </p>
          <div aria-live="polite" className="w-full max-w-[420px] text-left">
            {attempted && (
              <Alert tone="info" title="Verificación aún no disponible">
                La verificación real llega con la conexión al backend. Por ahora no se envían datos.
              </Alert>
            )}
          </div>
          <form noValidate onSubmit={handleSubmit} className="flex w-full max-w-[420px] flex-col gap-4 text-left">
            <Field label="Código de 6 dígitos" hint="El código cambia cada 30 segundos." error={error}>
              {(control) => (
                <Input
                  {...control}
                  ref={codeRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="tracking-[0.3em]"
                />
              )}
            </Field>
            <Button type="submit" fullWidth>
              Verificar y continuar
            </Button>
            <LinkButton to="/ingresar" variant="ghost" fullWidth>
              Cancelar
            </LinkButton>
            <p className="text-center text-sm text-muted">El step-up será válido por un máximo de 5 minutos.</p>
          </form>
        </section>
      </main>
    </div>
  );
}
