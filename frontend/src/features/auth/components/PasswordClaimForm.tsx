import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { ApiError } from '../../../lib/demoApi.js';
import { tokenStatusFor } from '../tokenStatus.js';
import { newPasswordError, PASSWORD_HINT } from '../validation.js';
import type { TokenStatus } from './TokenStatusView.js';

type Failure = 'limite' | 'red';

export type PasswordClaimFormProps = {
  submitLabel: string;
  /** POST del reclamo con la contraseña; debe lanzar el `ApiError` del backend si falla. */
  claim: (password: string) => Promise<void>;
  onDone: () => void;
  onLinkProblem: (status: TokenStatus) => void;
};

// Formulario de contraseña de los enlaces de reclamo (alta asistida, invitación de administrador). La contraseña
// nunca se conserva tras enviar; un 422 es contraseña rechazada y un 400/404/409/410 es un problema del enlace.
export function PasswordClaimForm({ submitLabel, claim, onDone, onLinkProblem }: PasswordClaimFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<Failure>();
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = newPasswordError(password);
    flushSync(() => setError(found));
    if (found) return passwordRef.current?.focus();
    inFlight.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      await claim(password);
      onDone();
    } catch (caught) {
      const linkStatus = tokenStatusFor(caught);
      const status = caught instanceof ApiError ? caught.status : undefined;
      if (linkStatus) onLinkProblem(linkStatus);
      else if (status === 422) {
        flushSync(() => setError('Elige otra contraseña: esta no cumple los requisitos.'));
        passwordRef.current?.focus();
      } else setFailure(status === 429 ? 'limite' : 'red');
    } finally {
      inFlight.current = false;
      setPassword('');
      setPending(false);
    }
  }

  return (
    <>
      <div aria-live="polite">
        {failure && (
          <Alert tone="danger" title="No se pudo guardar">
            {failure === 'limite' ? 'Hiciste demasiados intentos. Espera unos minutos.' : 'Inténtalo de nuevo en unos minutos.'}
          </Alert>
        )}
      </div>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
        <Field label="Nueva contraseña" hint={PASSWORD_HINT} error={error}>
          {(control) => (
            <Input
              {...control}
              ref={passwordRef}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <div>
          <Button type="submit" aria-disabled={pending} aria-busy={pending}>{submitLabel}</Button>
        </div>
      </form>
    </>
  );
}
