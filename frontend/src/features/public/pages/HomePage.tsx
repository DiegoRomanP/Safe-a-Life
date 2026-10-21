import { Alert } from '../../../components/ui/Alert.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';

// PUB-01 Inicio público (Penpot, versión «+»).
const steps = [
  { title: 'El hospital publica', detail: 'Una necesidad de glóbulos rojos.' },
  { title: 'El sistema preselecciona', detail: 'Según grupo declarado, disponibilidad y distancia.' },
  { title: 'Tú decides', detail: 'Confirmas o rechazas tu intención de asistir.' },
];

const commitments = [
  { title: 'Privacidad por diseño', detail: 'Cada rol ve únicamente la información necesaria.' },
  { title: 'Decisión informada', detail: 'Confirmar significa intención de asistir.' },
  { title: 'Hospitales autorizados', detail: 'La coordinación siempre está mediada por una institución.' },
];

export function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1288px] flex-col gap-10 px-4 py-10 sm:px-6 lg:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_554px]">
        <section aria-labelledby="hero-titulo" className="flex flex-col gap-6">
          <h1 id="hero-titulo" className="font-editorial text-4xl leading-tight font-medium text-ink sm:text-5xl">
            Conectamos necesidades hospitalarias con personas dispuestas a ayudar.
          </h1>
          <p className="max-w-[610px] text-lg text-muted">
            Save a Life permite que hospitales autorizados contacten a posibles donantes cercanos mediante un
            proceso protegido y sin contacto con pacientes.
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkButton to="/registro">Crear cuenta de donante</LinkButton>
            <LinkButton to="/alta-asistida" variant="ghost">
              Reclamar alta asistida
            </LinkButton>
          </div>
        </section>

        <section
          id="como-funciona"
          aria-labelledby="como-funciona-titulo"
          className="scroll-mt-6 rounded-2xl bg-petrol p-6 text-white sm:p-10"
        >
          <h2 id="como-funciona-titulo" className="text-2xl font-bold">
            Así funciona
          </h2>
          <ol className="mt-6 flex flex-col gap-6">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface font-bold text-petrol"
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-lg font-semibold">{step.title}</p>
                  <p className="text-sm text-white/85">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Alert tone="brand" title="Prototipo académico">
        Trabaja únicamente con datos sintéticos y no determina elegibilidad médica.
      </Alert>

      <section aria-label="Compromisos" className="rounded-xl bg-canvas p-6">
        <ul className="grid gap-6 md:grid-cols-3">
          {commitments.map((item) => (
            <li key={item.title}>
              <h2 className="text-lg font-semibold text-ink">{item.title}</h2>
              <p className="text-sm text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
