import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { destinationFor } from '../session/destination.js';
import { beginLogin, getAuthOperationState, getAuthSession, subscribeAuthOperation } from '../session/session.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { LoginForm } from '../components/LoginForm.js';

// AUTH-01: con sesión verificada cada rol entra a su área; hospital y superadmin completan antes MFA (aal 2).

export function LoginPage() {
  const navigate = useNavigate();
  const logoutFailed = (useLocation().state as { logoutFailed?: boolean } | null)?.logoutFailed === true;
  const operationState = useSyncExternalStore(
    subscribeAuthOperation,
    getAuthOperationState,
    getAuthOperationState,
  );
  const pending = operationState === 'pending';
  const session = operationState === 'success' ? getAuthSession() : null;
  const destination = session ? destinationFor(session) : null;

  useEffect(() => {
    if (destination) navigate(destination, { replace: true });
  }, [destination, navigate]);

  return (
    <AuthShell
      wideAside
      asideTitle="Accede a tu espacio seguro"
      asideDetail="Gestiona tus invitaciones o coordina necesidades de tu institución según tu rol asignado."
      asideFooter={
        <Alert tone="info" title="Uso académico">
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

        {operationState === 'expired' && (
          <Alert tone="info" title="Tu sesión terminó">
            Ingresa de nuevo para continuar.
          </Alert>
        )}

        {logoutFailed && operationState === 'idle' && (
          <Alert tone="warning" title="No pudimos cerrar la sesión en el servidor">
            Si usas un equipo compartido, cierra el navegador. Esta pestaña no volverá a abrir la sesión sin ingresar de nuevo.
          </Alert>
        )}

        <div aria-live="polite" aria-atomic="true" aria-busy={pending}>
          {operationState === 'pending' && <Alert tone="info" title="Conectando">Verificando la sesión.</Alert>}
          {operationState === 'success' && (
            <Alert tone="success" title="Sesión iniciada">
              Abriendo tu área.
            </Alert>
          )}
          {operationState === 'rejected' && (
            // Neutro: no revela si el correo existe ni en qué paso del registro está.
            <Alert tone="danger" title="No pudimos iniciar sesión">
              Revisa el correo y la contraseña. Si acabas de verificar tu correo, primero crea tu contraseña con el enlace que te
              enviamos.
            </Alert>
          )}
          {operationState === 'limited' && (
            <Alert tone="warning" title="Demasiados intentos">
              Espera unos minutos antes de volver a intentarlo.
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

      </AuthCard>
    </AuthShell>
  );
}
