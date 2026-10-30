import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { beginLogin, getAuthOperationState, getAuthSession, subscribeAuthOperation } from '../session/session.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { LoginForm } from '../components/LoginForm.js';

// AUTH-01: con sesión verificada, el donante entra a su área; hospital y superadmin todavía no están conectados.
export function LoginPage() {
  const navigate = useNavigate();
  const logoutFailed = (useLocation().state as { logoutFailed?: boolean } | null)?.logoutFailed === true;
  const operationState = useSyncExternalStore(
    subscribeAuthOperation,
    getAuthOperationState,
    getAuthOperationState,
  );
  const pending = operationState === 'pending';
  const isDonor = operationState === 'success' && getAuthSession()?.role === 'donante';

  useEffect(() => {
    if (isDonor) navigate('/donante/perfil', { replace: true });
  }, [isDonor, navigate]);

  return (
    <AuthShell
      wideAside
      asideTitle="Accede a tu espacio seguro"
      asideDetail="Gestiona tus invitaciones o coordina necesidades de tu institución según tu rol asignado."
      asideFooter={
        <Alert tone="warning" title="Uso académico">
          No ingreses datos reales en este prototipo.
        </Alert>
      }
    >
      <AuthCard labelledBy="login-titulo" className="max-w-[580px]">
        <div className="flex flex-col gap-1">
          <h1 id="login-titulo" className="text-3xl font-bold text-ink">
            Iniciar sesión
          </h1>
          <p className="text-muted">Ingresa con tu correo verificado.</p>
        </div>

        {logoutFailed && operationState === 'idle' && (
          <Alert tone="warning" title="No pudimos cerrar la sesión en el servidor">
            Si usas un equipo compartido, cierra el navegador. Esta pestaña no volverá a abrir la sesión sin ingresar de nuevo.
          </Alert>
        )}

        <div aria-live="polite" aria-atomic="true" aria-busy={pending}>
          {operationState === 'pending' && <Alert tone="info" title="Conectando">Verificando la sesión.</Alert>}
          {operationState === 'success' && (
            <Alert tone="success" title="Sesión iniciada">
              {isDonor ? 'Abriendo tu perfil.' : 'Tu área todavía no está disponible en este prototipo.'}
            </Alert>
          )}
          {operationState === 'error' && (
            <Alert tone="danger" title="No fue posible confirmar la sesión">
              Este intento no verificó la sesión localmente. Puede quedar una sesión activa en el servidor.
            </Alert>
          )}
        </div>

        <LoginForm onSubmit={beginLogin} disabled={pending} />

        <hr className="border-line" />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">¿Aún no tienes cuenta de donante?</p>
          <LinkButton to="/registro" variant="secondary" fullWidth>
            Crear cuenta
          </LinkButton>
        </div>

        {/* Solo en desarrollo: áreas aún demo, sin guard (el donante ya exige sesión real). */}
        {import.meta.env.DEV && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-muted p-4">
            <p className="text-sm font-semibold text-muted">Solo DEV: recorridos con datos sintéticos</p>
            <LinkButton to="/hospital" variant="ghost" fullWidth>
              Entrar como hospital de prueba
            </LinkButton>
            <LinkButton to="/superadmin" variant="ghost" fullWidth>
              Entrar como superadmin de prueba
            </LinkButton>
          </div>
        )}
      </AuthCard>
    </AuthShell>
  );
}
