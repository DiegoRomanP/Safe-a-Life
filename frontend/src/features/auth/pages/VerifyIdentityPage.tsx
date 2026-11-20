import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, useNavigate } from 'react-router-dom';
import { Brand } from '../../../components/layout/Brand.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { ApiError } from '../../../lib/demoApi.js';
import { destinationFor } from '../session/destination.js';
import { enrollMfa, getAuthSession, verifyMfa } from '../session/session.js';

// El contrato acepta de 6 a 8 dígitos (verifyMfaChallenge).
const CODE_SHAPE = /^[0-9]{6,8}$/;

type Notice = Readonly<{ tone: 'danger' | 'warning'; title: string; text: string }>;

function verifyFailure(error: unknown): Notice {
  if (error instanceof ApiError && error.status === 401) {
    return { tone: 'danger', title: 'No se pudo verificar', text: 'El código es incorrecto o venció. Escribe el código vigente de tu aplicación.' };
  }
  if (error instanceof ApiError && error.status === 429) {
    return { tone: 'warning', title: 'Espera un momento', text: 'Demasiados intentos. Espera unos minutos antes de volver a probar.' };
  }
  return { tone: 'danger', title: 'No se pudo verificar', text: 'No pudimos completar la verificación. Intenta de nuevo.' };
}

// AUTH-05 MFA al ingresar (hospital y superadmin). Con el reto del login se escribe el código; sin factor enrolado se
// configura el autenticador primero. El step-up por acción sensible llega con las pantallas de superadmin (F3).
// shortcut: se muestra la clave del autenticador como texto, sin código QR; añadir QR si se incorpora una librería.
export function VerifyIdentityPage() {
  const navigate = useNavigate();
  const session = getAuthSession();
  const [challengeId, setChallengeId] = useState(session?.mfaChallengeId);
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [relogin, setRelogin] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  if (!session) return <Navigate to="/ingresar" replace />;
  if (session.role === 'donante' || session.aal === 2) return <Navigate to={destinationFor(session)} replace />;

  async function startEnrollment() {
    setBusy(true);
    setNotice(undefined);
    try {
      const enrollment = await enrollMfa();
      setSecret(new URL(enrollment.otpauthUri).searchParams.get('secret') ?? enrollment.otpauthUri);
      setChallengeId(enrollment.challengeId);
    } catch (failure) {
      // 409: ya existe un factor y el reto del login se perdió (p. ej. tras recargar); un login nuevo emite otro.
      if (failure instanceof ApiError && failure.status === 409) setRelogin(true);
      else setNotice({ tone: 'danger', title: 'No se pudo configurar', text: 'No pudimos iniciar la configuración. Intenta de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !challengeId) return;
    const clean = code.replace(/\s/g, '');
    const found = CODE_SHAPE.test(clean) ? undefined : 'Ingresa el código de 6 dígitos de tu aplicación.';
    flushSync(() => setError(found));
    if (found) return codeRef.current?.focus();
    setBusy(true);
    setNotice(undefined);
    try {
      navigate(destinationFor(await verifyMfa(challengeId, clean)), { replace: true });
    } catch (failure) {
      setCode('');
      setNotice(verifyFailure(failure));
      setBusy(false);
      codeRef.current?.focus();
    }
  }

  const needsEnrollment = !challengeId;

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
            {needsEnrollment
              ? 'Tu cuenta administrativa requiere una aplicación autenticadora. Configúrala una vez para continuar.'
              : 'Esta cuenta requiere autenticación reforzada. Ingresa el código de tu aplicación autenticadora.'}
          </p>
          <div aria-live="polite" className="w-full max-w-[420px] text-left">
            {notice && <Alert tone={notice.tone} title={notice.title}>{notice.text}</Alert>}
            {relogin && (
              <Alert tone="warning" title="Vuelve a ingresar">
                Ya hay un autenticador configurado. Vuelve a ingresar para recibir un nuevo reto y escribir su código.
              </Alert>
            )}
          </div>

          {relogin ? (
            <LinkButton to="/ingresar">Volver a ingresar</LinkButton>
          ) : needsEnrollment ? (
            <div className="flex w-full max-w-[420px] flex-col gap-4">
              <Button type="button" fullWidth disabled={busy} onClick={() => void startEnrollment()}>
                Configurar autenticador
              </Button>
              <LinkButton to="/ingresar" variant="ghost" fullWidth>
                Cancelar
              </LinkButton>
            </div>
          ) : (
            <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex w-full max-w-[420px] flex-col gap-4 text-left">
              {secret && (
                <div className="rounded-xl border border-line p-4 text-sm">
                  <p className="font-semibold text-ink">Agrega esta clave a tu aplicación autenticadora</p>
                  <p className="mt-1 text-muted">Elige «Ingresar clave manualmente» y escribe:</p>
                  <p className="mt-2 break-all font-mono text-base tracking-wider text-ink">{secret}</p>
                </div>
              )}
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
              <Button type="submit" fullWidth disabled={busy}>
                Verificar y continuar
              </Button>
              <LinkButton to="/ingresar" variant="ghost" fullWidth>
                Cancelar
              </LinkButton>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
