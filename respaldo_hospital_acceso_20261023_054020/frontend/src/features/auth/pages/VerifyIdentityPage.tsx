import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearPendingMfaChallenge, enrollMfa, getSession, mfaSetupSecret, pendingMfaChallenge, safeAdminReturn, verifyMfa, verifyStepUp, type MfaEnrollment, type Session } from '../../../api/auth.js';
import { ApiError, createMutationIntent, errorMessage } from '../../../api/client.js';
import { Brand } from '../../../components/layout/Brand.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';

const CODE_SHAPE = /^[0-9]{6,8}$/;
function uncertain(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

export function VerifyIdentityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const stepUp = new URLSearchParams(location.search).get('modo') === 'reforzar';
  const returnTo = safeAdminReturn((location.state as { returnTo?: unknown } | null)?.returnTo);
  const [session, setSession] = useState<Session>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [enrollment, setEnrollment] = useState<MfaEnrollment>();
  const [challenge, setChallenge] = useState(pendingMfaChallenge);
  const [enrollmentUncertain, setEnrollmentUncertain] = useState(false);
  const [verificationUncertain, setVerificationUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const enrollmentIntent = useRef(createMutationIntent());
  const verificationIntent = useRef(createMutationIntent());
  useEffect(() => () => { clearPendingMfaChallenge(); enrollmentIntent.current.reset(); verificationIntent.current.reset(); }, []);
  useEffect(() => {
    let active = true;
    void getSession().then((value) => {
      if (!active) return;
      setSession(value); setLoading(false); setError('');
      if (value.aal === 2 && !stepUp && !value.mfaRequired) navigate(value.actor.role === 'superadmin' ? returnTo : '/', { replace: true });
    }).catch((failure: unknown) => {
      if (!active) return;
      setLoading(false);
      if (failure instanceof ApiError && failure.status === 401) navigate('/ingresar', { replace: true });
      else setError(errorMessage(failure));
    });
    return () => { active = false; };
  }, [navigate, revision, returnTo, stepUp]);

  async function enroll(restart = false) {
    if (busy.current) return;
    if (restart) enrollmentIntent.current.reset();
    busy.current = true; setPending(true); setError('');
    try {
      const value = await enrollMfa(enrollmentIntent.current.keyFor('/api/v1/auth/mfa-enrollments', null));
      setEnrollment(value); setChallenge(value.challengeId); setEnrollmentUncertain(false); enrollmentIntent.current.reset();
    } catch (failure) {
      if (uncertain(failure)) {
        setEnrollmentUncertain(true);
        setError('No pudimos recuperar la configuración. El alta pudo haberse iniciado. Vuelve a ingresar o reinicia explícitamente la configuración pendiente.');
      } else if (failure instanceof ApiError && failure.status === 409) {
        setError('Este intento ya no puede reutilizarse o ya tienes un factor verificado. Vuelve a ingresar; si el alta quedó pendiente, puedes reiniciarla.');
      } else setError(errorMessage(failure));
    } finally { busy.current = false; setPending(false); }
  }

  function finish(verified: Session) {
    if (verified.aal !== 2 || verified.mfaRequired) throw new ApiError(403, 'MFA_REQUIRED');
    setEnrollment(undefined); verificationIntent.current.reset();
    navigate(verified.actor.role === 'superadmin' ? returnTo : '/', { replace: true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = code.replace(/\s/g, '');
    flushSync(() => setValidationError(CODE_SHAPE.test(clean) ? undefined : 'Ingresa el código de 6 a 8 dígitos de tu aplicación.'));
    if (!CODE_SHAPE.test(clean)) { codeRef.current?.focus(); return; }
    if (busy.current || !session || (!stepUp && !challenge)) return;
    busy.current = true; setPending(true); setError(''); setCode(''); setVerificationUncertain(false);
    try {
      const path = stepUp ? '/api/v1/auth/step-up-verifications' : '/api/v1/auth/mfa-verifications';
      const key = verificationIntent.current.keyFor(path, stepUp ? { code: clean } : { challengeId: challenge, code: clean });
      const verified = stepUp ? (await verifyStepUp(clean, key), session) : await verifyMfa(challenge!, clean, key);
      finish(verified);
    } catch (failure) {
      if (uncertain(failure) && !stepUp) {
        try {
          const current = await getSession();
          if (current.aal === 2 && !current.mfaRequired) { finish(current); return; }
        } catch { /* Sin confirmación del servidor no se concede acceso. */ }
      }
      if (uncertain(failure) || (failure instanceof ApiError && failure.status === 409)) {
        setVerificationUncertain(true);
        setError(failure instanceof ApiError && failure.status === 409
          ? 'Este intento ya no puede reutilizarse. Reinicia el ingreso para obtener un reto nuevo, o usa el siguiente código para una nueva verificación reforzada.'
          : 'No pudimos confirmar el resultado de la verificación. No se ha habilitado el acceso desde esta pantalla.');
      } else setError(errorMessage(failure));
    } finally { busy.current = false; setPending(false); }
  }

  const admin = session?.actor.role === 'superadmin' || session?.actor.role === 'admin_hospitalario';
  const mayVerify = !loading && admin && (stepUp ? session?.aal === 2 : !!challenge);
  return <div className="flex min-h-screen flex-col bg-canvas">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-10"><Brand /><Badge tone="info">Acceso administrativo</Badge></header>
    <main className="flex flex-1 items-center justify-center px-4 pb-12">
      <section aria-labelledby="mfa-titulo" className="flex w-full max-w-[656px] flex-col gap-5 rounded-2xl border border-line bg-surface px-6 py-10 sm:px-12">
        <h1 id="mfa-titulo" className="text-center text-3xl font-bold text-ink">Verifica tu identidad</h1>
        <p className="text-muted">Ingresa el código de tu aplicación autenticadora. {stepUp ? 'La autenticación reforzada será válida por un máximo de 5 minutos.' : 'Se requiere un segundo factor para acceder a la administración.'}</p>
        <div aria-live="polite">{loading && <p role="status">Comprobando sesión…</p>}{pending && <p role="status">Verificando…</p>}{error && <Alert tone="warning" title="No pudimos verificar">{error}</Alert>}</div>
        {!loading && !session && <Button variant="secondary" onClick={() => { setLoading(true); setRevision((n) => n + 1); }}>Reintentar conexión</Button>}
        {session && !admin && <Alert tone="warning" title="Acceso restringido">Esta verificación solo está disponible para cuentas administrativas.</Alert>}
        {admin && !stepUp && !challenge && <div className="flex flex-col gap-3">
          <Alert tone="info" title="Configura o recupera tu segundo factor">Si acabas de crear tu cuenta, configura la aplicación autenticadora. Si ya tenías un factor o recargaste esta pantalla, vuelve a ingresar para obtener un reto nuevo.</Alert>
          <Button onClick={() => { void enroll(); }} disabled={pending}>Configurar autenticador</Button>
          {enrollmentUncertain && <><p className="text-sm text-muted">Reiniciar descartará factores pendientes sin verificar y generará una configuración nueva. No elimina un factor ya verificado.</p><Button variant="secondary" onClick={() => { void enroll(true); }} disabled={pending}>Reiniciar configuración pendiente</Button></>}
          <LinkButton to="/ingresar" variant="secondary">Volver a ingresar</LinkButton>
        </div>}
        {verificationUncertain && <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{stepUp ? 'Espera el siguiente código de tu autenticador e ingrésalo para iniciar una verificación nueva. Una sesión AAL2 por sí sola no confirma la vigencia de esta acción reforzada.' : 'Vuelve a ingresar para comprobar tu sesión y obtener un reto nuevo si hace falta. No repitas indefinidamente el mismo intento.'}</p>
          {!stepUp && <LinkButton to="/ingresar" variant="secondary">Volver a ingresar</LinkButton>}
        </div>}
        {admin && !stepUp && challenge && !enrollment && <p className="text-sm text-muted">Usa el autenticador que ya configuraste para esta cuenta. Por seguridad, el código QR de un factor verificado no se vuelve a mostrar.</p>}
        {enrollment && <section aria-labelledby="mfa-setup-title" className="flex min-w-0 flex-col gap-4">
          <h2 id="mfa-setup-title" className="text-xl font-semibold">Configura tu autenticador</h2>
          <p className="text-muted">Escanea este QR con tu aplicación autenticadora. Luego escribe el código de un solo uso para completar la configuración.</p>
          <div className="self-center rounded-lg border border-line bg-white p-2">
            <QRCodeSVG value={enrollment.otpauthUri} size={224} marginSize={4} level="M" bgColor="#ffffff" fgColor="#000000" role="img" aria-label="Código QR para configurar tu autenticador" title="Código QR para configurar tu autenticador" className="h-auto max-w-full" />
          </div>
          <p className="text-sm text-muted">El QR y la clave son privados. No los compartas ni los incluyas en capturas.</p>
          <details className="min-w-0 rounded-lg border border-line p-3">
            <summary className="cursor-pointer font-semibold">No puedo escanear el QR: configuración manual</summary>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <p className="text-sm text-muted">Agrega una cuenta basada en tiempo (TOTP): 6 dígitos y un código nuevo cada 30 segundos.</p>
              <label htmlFor="mfa-manual-key" className="text-sm font-semibold">Clave de configuración<input id="mfa-manual-key" className="mt-2 w-full rounded-lg border border-line p-3 font-mono text-sm" readOnly value={mfaSetupSecret(enrollment.otpauthUri)} autoComplete="off" /></label>
              <label htmlFor="mfa-enrollment-uri" className="text-sm font-semibold">URI de configuración<input id="mfa-enrollment-uri" className="mt-2 w-full rounded-lg border border-line p-3 text-sm" readOnly value={enrollment.otpauthUri} autoComplete="off" /></label>
            </div>
          </details>
        </section>}
        <form noValidate onSubmit={(event) => { void submit(event); }} className="flex flex-col gap-4">
          <Field label="Código de un solo uso" hint="Usa el código vigente de tu aplicación." error={validationError}>{(control) => <Input {...control} ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} disabled={!mayVerify || pending} />}</Field>
          <Button type="submit" fullWidth disabled={!mayVerify || pending}>Verificar y continuar</Button>
          <LinkButton to={stepUp ? returnTo : '/ingresar'} variant="ghost" fullWidth>Cancelar</LinkButton>
        </form>
      </section>
    </main>
  </div>;
}
