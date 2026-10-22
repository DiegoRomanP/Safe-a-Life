import { Brand } from '../../../components/layout/Brand.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { useFragmentToken } from '../../auth/useFragmentToken.js';

// SYS-01 Acceso neutro. Mismo mensaje si el recurso no existe, cambió o no hay
// permiso, para no revelar información. No muestra datos de la ruta pedida.
export function NotFoundPage() {
  // Una ruta mal escrita puede traer el #token de un correo: se borra de la
  // dirección y del historial de la pestaña aunque esta vista no lo use.
  useFragmentToken();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-10">
        <Brand />
        <Badge tone="brand">Prototipo académico</Badge>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <section className="flex w-full max-w-[720px] flex-col items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-12 text-center sm:px-12">
          <span
            aria-hidden="true"
            className="flex size-28 items-center justify-center rounded-full bg-soft-blue text-5xl font-bold text-petrol"
          >
            i
          </span>
          <h1 className="text-3xl font-bold text-ink">No pudimos abrir este recurso</h1>
          <p className="max-w-[544px] text-muted">
            Puede que no exista, que haya cambiado o que tu cuenta no tenga acceso. Por seguridad no
            mostramos más información.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <LinkButton to="/">Volver al inicio</LinkButton>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Intentar nuevamente
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
