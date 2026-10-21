import { Outlet } from 'react-router-dom';
import { LinkButton } from '../ui/LinkButton.js';
import { Brand } from './Brand.js';

// Cabecera pública de Penpot (PUB-01): marca, «Cómo funciona», Ingresar y
// Registrarme, separada del contenido por una línea fina. «Cómo funciona» es
// un enlace de documento para que el navegador baje hasta la sección; en
// móvil se oculta porque la sección queda inmediatamente debajo.
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1288px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Brand />
          <nav aria-label="Principal" className="flex flex-wrap items-center gap-3 sm:gap-4">
            <a
              href="/#como-funciona"
              className="hidden rounded font-semibold text-petrol underline-offset-4 hover:underline sm:inline"
            >
              Cómo funciona
            </a>
            <LinkButton to="/ingresar" variant="secondary">
              Ingresar
            </LinkButton>
            <LinkButton to="/registro">Registrarme</LinkButton>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
