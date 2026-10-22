import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { AuthCard, AuthShell } from '../components/AuthShell.js';
import { LoginForm } from '../components/LoginForm.js';

// AUTH-01 Inicio de sesión (Penpot, versión «+»). Todavía no hay cliente HTTP
// (D-4): al enviar no se manda nada y se avisa en una región aria-live que ya
// existe en el DOM, para que el anuncio llegue al lector de pantalla.
export function LoginPage() {
  const [attempted, setAttempted] = useState(false);

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

        <div aria-live="polite">
          {attempted && (
            <Alert tone="info" title="Acceso aún no disponible">
              El inicio de sesión real llega con la conexión al backend. Por ahora no se envían datos.
            </Alert>
          )}
        </div>

        <LoginForm onSubmit={() => setAttempted(true)} />

        <hr className="border-line" />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">¿Aún no tienes cuenta de donante?</p>
          <LinkButton to="/registro" variant="secondary" fullWidth>
            Crear cuenta
          </LinkButton>
        </div>

        {/* Solo en desarrollo: entrada al recorrido con datos sintéticos (D-4). */}
        {import.meta.env.DEV && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-muted p-4">
            <p className="text-sm font-semibold text-muted">Vista de desarrollo</p>
            <LinkButton to="/donante" variant="ghost" fullWidth>
              Entrar como donante de prueba
            </LinkButton>
            <LinkButton to="/donante/bienvenida" variant="ghost" fullWidth>
              Entrar como donante nuevo
            </LinkButton>
            <LinkButton to="/hospital" variant="ghost" fullWidth>
              Entrar como hospital de prueba
            </LinkButton>
          </div>
        )}
      </AuthCard>
    </AuthShell>
  );
}
