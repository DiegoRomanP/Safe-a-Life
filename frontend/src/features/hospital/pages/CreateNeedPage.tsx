import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { BLOOD_TYPES, bloodTypeLabel, formatDateTime, type BloodType } from '../../../lib/format.js';
import { useHospitalDemo } from '../HospitalDemoContext.js';
import { urgencyLabel } from '../labels.js';
import type { Urgency } from '../types.js';

type Errors = Partial<Record<'bloodType' | 'target' | 'site' | 'radius' | 'hours', string>>;

const bloodTypeOptions = BLOOD_TYPES.map((value) => ({ value, label: bloodTypeLabel(value) }));
const urgencyOptions = (['Normal', 'Urgente', 'Critica'] as const).map((value) => ({
  value,
  label: urgencyLabel[value].label,
}));

/** Entero dentro de [min, max] o el mensaje de error. */
function rangeError(value: string, min: number, max: number, unit: string): string | undefined {
  if (!/^\d+$/.test(value.trim())) return `Ingresa un número entero de ${min} a ${max} ${unit}.`;
  const number = Number(value);
  return number < min || number > max ? `Usa un valor de ${min} a ${max} ${unit}.` : undefined;
}

const reminders = [
  { term: 'Meta', detail: 'Expresa intenciones de asistir, no unidades de sangre.' },
  { term: 'Urgencia', detail: 'No amplía el radio ni crea lotes automáticos.' },
  { term: 'Preselección', detail: 'La matriz es académica y no determina elegibilidad.' },
  { term: 'Datos', detail: 'No incluyas pacientes, diagnósticos ni historias clínicas.' },
];

// HOS-02 Crear necesidad (Penpot «+»). Arma el cuerpo de createHospitalNeed:
// componente fijo RBC, grupo, meta de 1 a 50 intenciones, sede propia, radio
// de 1 a 50 km, urgencia y vencimiento de 1 a 72 horas. «Activar» crea y
// luego aplica transitionOwnHospitalNeed. Sin backend (D-4).
export function CreateNeedPage() {
  const { sites, createNeed } = useHospitalDemo();
  const navigate = useNavigate();
  const [bloodType, setBloodType] = useState('');
  const [target, setTarget] = useState('');
  const [siteId, setSiteId] = useState('');
  const [radius, setRadius] = useState('10');
  const [urgency, setUrgency] = useState<Urgency>('Normal');
  const [hours, setHours] = useState('24');
  const [errors, setErrors] = useState<Errors>({});
  // Hora de referencia fija al abrir el formulario, para mostrar la fecha de
  // vencimiento sin leer el reloj en cada render.
  const [openedAt] = useState(() => Date.now());
  const refs = {
    bloodType: useRef<HTMLSelectElement>(null),
    target: useRef<HTMLInputElement>(null),
    site: useRef<HTMLSelectElement>(null),
    radius: useRef<HTMLInputElement>(null),
    hours: useRef<HTMLInputElement>(null),
  };
  const hoursValid = !rangeError(hours, 1, 72, 'horas');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activate = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'activar';
    const found: Errors = {
      bloodType: bloodType ? undefined : 'Selecciona el grupo requerido.',
      target: rangeError(target, 1, 50, 'intenciones'),
      site: siteId ? undefined : 'Selecciona una sede del hospital.',
      // El radio es opcional en el contrato: vacío equivale a 10 km.
      radius: radius.trim() ? rangeError(radius, 1, 50, 'km') : undefined,
      hours: rangeError(hours, 1, 72, 'horas'),
    };
    flushSync(() => setErrors(found));
    const first = (Object.keys(refs) as Array<keyof Errors>).find((key) => found[key]);
    if (first) return refs[first].current?.focus();
    const created = createNeed(
      {
        requiredBloodType: bloodType as BloodType,
        targetConfirmations: Number(target),
        siteId,
        radiusKm: radius.trim() ? Number(radius) : 10,
        urgency,
        expiresInHours: Number(hours),
      },
      activate,
    );
    navigate(`/hospital/necesidades/${created.needId}`, { state: { created: activate ? 'activa' : 'borrador' } });
  }

  return (
    <>
      <Link to="/hospital/necesidades" className="self-start rounded font-semibold text-petrol underline underline-offset-4">
        Volver a necesidades
      </Link>
      <PageHeader title="Crear necesidad" description="Define una meta de intenciones de asistir para glóbulos rojos." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_304px]">
        <Card title="Información de la necesidad">
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Componente" hint="El componente es fijo para este prototipo.">
                {(control) => <Input {...control} readOnly value="Glóbulos rojos (RBC)" />}
              </Field>
              <Field label="Grupo requerido" hint="Grupo que necesita el paciente. La preselección busca donantes compatibles según el grupo declarado por cada persona." error={errors.bloodType} required>
                {(control) => (
                  <Select
                    {...control}
                    ref={refs.bloodType}
                    placeholder="Selecciona una opción"
                    options={bloodTypeOptions}
                    value={bloodType}
                    onChange={(event) => setBloodType(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Meta de confirmaciones" hint="Entre 1 y 50 intenciones de asistir." error={errors.target} required>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.target}
                    inputMode="numeric"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Sede" hint="Solo sedes activas del hospital." error={errors.site} required>
                {(control) => (
                  <Select
                    {...control}
                    ref={refs.site}
                    placeholder="Selecciona una sede"
                    options={sites.map((site) => ({ value: site.siteId, label: site.publicName }))}
                    value={siteId}
                    onChange={(event) => setSiteId(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Radio en km" hint="Rango permitido: 1 a 50 km. Si lo dejas vacío, se usan 10 km." error={errors.radius}>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.radius}
                    inputMode="numeric"
                    value={radius}
                    onChange={(event) => setRadius(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Urgencia" hint="Solo informativa; no cambia la preselección.">
                {(control) => (
                  <Select
                    {...control}
                    options={urgencyOptions}
                    value={urgency}
                    onChange={(event) => setUrgency(event.target.value as Urgency)}
                  />
                )}
              </Field>
              <Field label="Vencimiento en horas" hint="Rango permitido: 1 a 72 horas." error={errors.hours} required>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.hours}
                    inputMode="numeric"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                  />
                )}
              </Field>
              <p className="self-center font-semibold text-ink">
                {hoursValid ? `Vence: ${formatDateTime(new Date(openedAt + Number(hours) * 3_600_000).toISOString())}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="submit" name="modo" value="borrador" variant="secondary">
                Guardar borrador
              </Button>
              <Button type="submit" name="modo" value="activar">
                Activar necesidad
              </Button>
            </div>
          </form>
        </Card>
        <aside aria-labelledby="antes-titulo" className="rounded-xl bg-petrol p-6 text-white">
          <h2 id="antes-titulo" className="text-xl font-semibold">
            Antes de activar
          </h2>
          <dl className="mt-6 flex flex-col gap-6">
            {reminders.map((item) => (
              <div key={item.term}>
                <dt className="text-sm font-semibold text-white/85">{item.term}</dt>
                <dd className="mt-1">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </>
  );
}
