import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/Ui.js';

const demoPassword = 'synthetic-demo-only';

const demoAccounts = [
  { role: 'Donante', email: 'donante.demo@example.test' },
  { role: 'Hospital', email: 'hospital.demo@example.test' },
  { role: 'Superadmin', email: 'superadmin.demo@example.test' },
] as const;

export function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="public-page">
      <a className="skip-link" href="#public-main">Saltar al contenido</a>
      <header className="public-header">
        <Brand />
        <div className="public-header__actions">
          <span className="environment-label"><span /> Entorno local</span>
          <button className="button button--secondary button--small" onClick={() => navigate('/login')}>
            Ingresar
          </button>
        </div>
      </header>

      <main id="public-main" className="public-main" tabIndex={-1}>
        <section className="hero-section" aria-labelledby="public-title">
          <div className="hero-copy">
            <p className="hero-kicker">Coordinación hospitalaria · Lima</p>
            <h1 id="public-title">Organiza avisos a donantes, con el hospital al centro.</h1>
            <p className="hero-description">
              Save a Life ayuda a hospitales autorizados a coordinar necesidades de sangre y
              respuestas voluntarias. El equipo clínico verifica cada paso.
            </p>
            <div className="hero-actions">
              <button className="button button--primary" onClick={() => navigate('/login')}>
                Entrar a la demostración <ArrowRight size={17} aria-hidden="true" />
              </button>
              <a className="text-link" href="#como-funciona">Conocer los límites</a>
            </div>
            <Notice tone="warning" title="Modo demostración">
              Datos sintéticos. No se envían correos ni se consultan servicios clínicos.
            </Notice>
          </div>

          <aside className="coordination-panel" aria-label="Cómo se coordina">
            <p className="coordination-panel__title">Una coordinación mediada</p>
            <ol className="coordination-steps">
              <li>
                <span>1</span>
                <div><strong>El hospital publica una necesidad</strong><p>Con sede y plazo definidos.</p></div>
              </li>
              <li>
                <span>2</span>
                <div><strong>El sistema envía avisos</strong><p>La persona decide si desea responder.</p></div>
              </li>
              <li>
                <span>3</span>
                <div><strong>El equipo clínico verifica</strong><p>La respuesta expresa intención, no elegibilidad.</p></div>
              </li>
            </ol>
            <div className="coordination-panel__footer">Sin contacto directo entre paciente y donante</div>
          </aside>
        </section>

        <section className="public-details" id="como-funciona">
          <div>
            <h2>Una herramienta de coordinación, no de decisión clínica.</h2>
            <p>
              La preselección académica usa grupo declarado y otros filtros del prototipo.
              No certifica compatibilidad clínica, asistencia, donación ni suficiencia.
            </p>
          </div>
          <div className="detail-rule">
            <span>Alcance de la demo</span>
            <p>Una vista hospitalaria navegable y fixtures adicionales para probar aislamiento.</p>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <Brand />
        <span>Prototipo académico · No usar con datos reales</span>
      </footer>
    </div>
  );
}

export function LoginPage({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const pendingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'recovery' | 'registration' | null>(null);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setError(null);
    setPendingAction(null);
    try {
      await onLogin(email.trim(), password);
    } catch {
      setPassword('');
      setError('No se pudo iniciar sesión. Verifica el correo y la contraseña e inténtalo de nuevo.');
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="access-page">
      <a className="skip-link" href="#login-main">Saltar al contenido</a>
      <aside className="login-story">
        <Link className="login-brand" to="/" aria-label="Save a Life, volver al inicio">
          <span className="login-brand__mark" aria-hidden="true" />
          <span>Save a Life</span>
        </Link>
        <div className="login-story__copy">
          <p className="login-story__heading">Accede a tu espacio seguro</p>
          <p className="login-story__description">
            Gestiona tus invitaciones o coordina necesidades de tu institución según tu rol asignado.
          </p>
        </div>
        <div className="login-academic-note">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Uso académico</strong>
            <p>No ingreses datos reales en este prototipo.</p>
          </div>
        </div>
      </aside>

      <main id="login-main" className="login-main" tabIndex={-1}>
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Iniciar sesión</h1>
          <p className="login-card__intro">Ingresa con tu correo verificado.</p>

          <form className="login-form" onSubmit={submitLogin} aria-busy={pending}>
            <div className="login-field">
              <label htmlFor="login-email">Correo</label>
              <input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                disabled={pending}
                id="login-email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@ejemplo.test"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                autoComplete="current-password"
                disabled={pending}
                id="login-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            <div className="login-recovery">
              <button
                className="login-inline-action"
                disabled={pending}
                onClick={() => setPendingAction('recovery')}
                type="button"
              >
                ¿Olvidaste tu contraseña?
              </button>
              {pendingAction === 'recovery' && (
                <p className="login-pending-note" role="status">
                  La recuperación de contraseña aún está pendiente en esta demostración.
                </p>
              )}
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button className="button button--primary button--wide login-submit" disabled={pending} type="submit">
              <span aria-live="polite">{pending ? 'Ingresando…' : 'Ingresar'}</span>
            </button>
          </form>

          <div className="login-divider" aria-hidden="true" />
          <p className="login-create-account-copy">¿Aún no tienes cuenta de donante?</p>
          <button
            className="login-create-account"
            disabled={pending}
            onClick={() => setPendingAction('registration')}
            type="button"
          >
            Crear cuenta
          </button>
          {pendingAction === 'registration' && (
            <p className="login-pending-note" role="status">
              El registro de donantes aún está pendiente. Por ahora, usa una cuenta sintética de la demostración.
            </p>
          )}

          <details className="login-demo-details">
            <summary>Ver credenciales de demostración</summary>
            <p>Usa únicamente estas cuentas sintéticas. El sistema asigna el perfil de cada cuenta:</p>
            <ul>
              {demoAccounts.map(({ role, email: accountEmail }) => (
                <li key={accountEmail}>
                  <span>{role}</span>
                  <code>{accountEmail}</code>
                </li>
              ))}
            </ul>
            <p className="login-demo-details__password">
              Contraseña compartida: <code>{demoPassword}</code>
            </p>
          </details>
        </section>
      </main>
    </div>
  );
}
