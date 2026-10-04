import { useState } from 'react';
import { ArrowRight, Building2, HeartHandshake, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ActorRole } from '../api/client.js';
import { Brand, Notice } from '../components/Ui.js';

const demoPassword = 'synthetic-demo-only';

const demoRoles: Array<{
  role: ActorRole;
  email: string;
  title: string;
  description: string;
  icon: typeof HeartHandshake;
}> = [
  {
    role: 'donante',
    email: 'donante.demo@example.test',
    title: 'Donante',
    description: 'Revisa invitaciones y gestiona tu disponibilidad.',
    icon: HeartHandshake,
  },
  {
    role: 'admin_hospitalario',
    email: 'hospital.demo@example.test',
    title: 'Hospital',
    description: 'Consulta necesidades e intenciones de asistir.',
    icon: Building2,
  },
  {
    role: 'superadmin',
    email: 'superadmin.demo@example.test',
    title: 'Superadmin',
    description: 'Revisa tareas administrativas y auditoría minimizada.',
    icon: ShieldCheck,
  },
];

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
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<ActorRole>('donante');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedDemo = demoRoles.find((demo) => demo.role === selectedRole)!;
  const SelectedIcon = selectedDemo.icon;

  async function submitLogin() {
    setPending(true);
    setError(null);
    try {
      await onLogin(selectedDemo.email, demoPassword);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
      setPending(false);
    }
  }

  return (
    <div className="access-page">
      <a className="skip-link" href="#login-main">Saltar al contenido</a>
      <header className="access-header">
        <button className="brand-button" onClick={() => navigate('/')} aria-label="Volver al inicio">
          <Brand />
        </button>
        <span className="environment-label"><span /> Entorno local</span>
      </header>
      <main id="login-main" className="access-main" tabIndex={-1}>
        <div className="access-intro">
          <p className="hero-kicker">Acceso al prototipo</p>
          <h1>Elige una vista de demostración.</h1>
          <p>Usa un perfil sintético para recorrer la interfaz según cada rol.</p>
        </div>
        <section className="login-panel" aria-labelledby="role-title">
          <h2 id="role-title">Continuar como</h2>
          <div className="role-options" role="group" aria-label="Perfil de demostración">
            {demoRoles.map(({ role, title, description, icon: Icon }) => (
              <button
                aria-pressed={selectedRole === role}
                className={`role-option${selectedRole === role ? ' role-option--selected' : ''}`}
                key={role}
                onClick={() => setSelectedRole(role)}
                type="button"
              >
                <Icon size={20} aria-hidden="true" />
                <span className="role-option__copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="role-option__selection" aria-hidden="true" />
              </button>
            ))}
          </div>
          {error && <Notice tone="error" title="No se pudo iniciar sesión">{error}</Notice>}
          <button className="button button--primary button--wide" disabled={pending} onClick={submitLogin}>
            <SelectedIcon size={18} aria-hidden="true" />
            {pending ? 'Ingresando…' : `Entrar como ${selectedDemo.title.toLocaleLowerCase('es')}`}
          </button>
          <p className="login-footnote">La sesión se mantiene en una cookie local. No guardamos credenciales en el navegador.</p>
        </section>
        <Notice tone="warning" title="Datos sintéticos">
          No uses correos, ubicaciones ni información de personas reales. Esta demo no se conecta a Supabase ni envía email.
        </Notice>
      </main>
    </div>
  );
}
