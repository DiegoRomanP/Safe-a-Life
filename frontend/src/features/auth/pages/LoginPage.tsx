import { useState } from 'react';
import { Brand } from '../../../components/layout/Brand.js';
import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { LoginForm } from '../components/LoginForm.js';

// AUTH-01 Inicio de sesión (Penpot, versión «+»). Todavía no hay cliente HTTP
// (D-4): al enviar no se manda nada y se avisa en una región aria-live que ya
// existe en el DOM, para que el anuncio llegue al lector de pantalla.
export function LoginPage() {
  const [attempted, setAttempted] = useState(false);

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[540px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-8 bg-petrol px-6 py-8 text-white sm:px-12 lg:py-12">
        <Brand tone="dark" />
        <div className="flex flex-col gap-4 lg:mt-24">
          <p className="font-editorial text-4xl leading-tight font-medium sm:text-5xl">Accede a tu espacio seguro</p>
          <p className="text-white/85">
            Gestiona tus invitaciones o coordina necesidades de tu institución según tu rol asignado.
          </p>
        </div>
        <Alert tone="warning" title="Uso académico" className="lg:mt-auto">
          No ingreses datos reales en este prototipo.
        </Alert>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <section
          aria-labelledby="login-titulo"
          className="flex w-full max-w-[580px] flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-12"
        >
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
        </section>
      </main>
    </div>
  );
}
