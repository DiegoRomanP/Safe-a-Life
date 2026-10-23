import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../../api/auth.js';
import { errorMessage } from '../../../api/client.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { LoginForm, type LoginCredentials } from '../components/LoginForm.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(credentials: LoginCredentials) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const session = await login(credentials, crypto.randomUUID());
      if (session.mfaRequired) navigate('/verificar-identidad', { replace: true });
      else navigate(session.actor.role === 'superadmin' ? '/superadmin/tareas' : session.actor.role === 'donante' ? '/donante/invitaciones' : '/', { replace: true });
    } catch (failure) { setError(errorMessage(failure)); }
    finally { submitting.current = false; setPending(false); }
  }
  return <AuthShell wideAside asideTitle="Accede a tu espacio seguro" asideDetail="Gestiona tus invitaciones o coordina necesidades de tu institución según tu rol asignado." asideFooter={<Alert tone="warning" title="Uso académico">No ingreses datos reales en este prototipo.</Alert>}>
    <AuthCard labelledBy="login-titulo" className="max-w-[580px]">
      <div className="flex flex-col gap-1"><h1 id="login-titulo" className="text-3xl font-bold text-ink">Iniciar sesión</h1><p className="text-muted">Ingresa con tu correo verificado.</p></div>
      <div aria-live="polite">{pending && <p role="status">Verificando acceso…</p>}{error && <Alert tone="warning" title="No pudimos ingresar">{error}</Alert>}</div>
      <LoginForm onSubmit={(credentials) => { void submit(credentials); }} disabled={pending} />
      <hr className="border-line" /><div className="flex flex-col gap-3"><p className="text-sm text-muted">¿Aún no tienes cuenta de donante?</p><LinkButton to="/registro" variant="secondary" fullWidth>Crear cuenta</LinkButton></div>
    </AuthCard>
  </AuthShell>;
}
