import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { cx } from '../../../components/ui/cx.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { Select } from '../../../components/ui/Select.js';
import { BLOOD_TYPES, bloodTypeLabel, type BloodType } from '../../../lib/format.js';
import { useDemoMutation } from '../../../lib/useDemoMutation.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { latitudeError, longitudeError } from '../location.js';

type Errors = { name?: string; bloodType?: string; latitude?: string; longitude?: string };

const bloodTypeOptions = BLOOD_TYPES.map((value) => ({ value, label: bloodTypeLabel(value) }));

// DON-01 Bienvenida y onboarding (contenido de Penpot «SaL» con estilo «+»).
// Completa los campos obligatorios de completeDonorOnboarding: nombre, grupo
// declarado, disponibilidad y ubicación aproximada. Sin backend (D-4) el
// resultado queda en el estado en memoria del área del donante.
export function OnboardingPage() {
  const { completeOnboarding } = useDonorDemo();
  const save = useDemoMutation(completeOnboarding);
  const [name, setName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Al terminar desaparece el formulario: el foco pasa al resultado para no
  // quedar en el body.
  useEffect(() => {
    if (done) resultRef.current?.focus();
  }, [done]);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    bloodType: useRef<HTMLSelectElement>(null),
    latitude: useRef<HTMLInputElement>(null),
    longitude: useRef<HTMLInputElement>(null),
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.pending) return;
    const found: Errors = {
      name: name.trim() ? (name.trim().length > 120 ? 'Usa como máximo 120 caracteres.' : undefined) : 'Ingresa tu nombre.',
      bloodType: bloodType ? undefined : 'Selecciona tu grupo declarado.',
      latitude: latitudeError(latitude),
      longitude: longitudeError(longitude),
    };
    flushSync(() => setErrors(found));
    const first = (Object.keys(refs) as Array<keyof Errors>).find((key) => found[key]);
    if (first) return refs[first].current?.focus();
    const result = await save.run({
      name: name.trim(),
      declaredBloodType: bloodType as BloodType,
      isAvailable,
      approximateLocation: { latitude: Number(latitude), longitude: Number(longitude) },
    });
    if (result.ok) setDone(true);
  }

  // El aviso de conflicto desaparece al revisarlo: el foco vuelve al envío.
  function review() {
    flushSync(save.reset);
    submitRef.current?.focus();
  }

  const steps = [
    { title: 'Correo verificado', badge: 'Completado', tone: 'success' as const },
    {
      title: 'Grupo declarado',
      badge: done ? `${bloodTypeLabel(bloodType as BloodType)} · Declarado` : 'Pendiente',
      tone: done ? ('info' as const) : ('warning' as const),
    },
    { title: 'Ubicación aproximada', badge: done ? 'Completado' : 'Pendiente', tone: done ? ('success' as const) : ('warning' as const) },
  ];

  return (
    <>
      <PageHeader
        title="Te damos la bienvenida"
        description="Completa lo esencial para recibir invitaciones de hospitales autorizados."
      />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-muted">{`${index + 1} de 3`}</p>
            <h2 className="text-xl font-semibold text-ink">{step.title}</h2>
            <Badge tone={step.tone} className="self-start">
              {step.badge}
            </Badge>
          </li>
        ))}
      </ol>
      <Alert tone="warning" title="Antes de recibir una invitación">
        El grupo es declarado y la ubicación es aproximada. Ninguno determina elegibilidad médica.
      </Alert>

      <div aria-live="polite">
        {done && (
          <div ref={resultRef} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
          <SuccessNotice
            announce={false}
            message="Perfil completo"
            detail="Hospitales autorizados podrán considerarte en una preselección académica."
            action={<LinkButton to="/donante/invitaciones">Ver mis invitaciones</LinkButton>}
          />
          </div>
        )}
      </div>

      {!done && (
        <Card title="Completa tu perfil">
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Nombre" hint="Usa un nombre de demostración." error={errors.name} required>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.name}
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Grupo declarado" hint="Usado solo para preselección." error={errors.bloodType} required>
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
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold text-ink">Ubicación aproximada</legend>
              <p className="text-sm text-muted">Máximo tres decimales; no uses tu domicilio real.</p>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Latitud" error={errors.latitude} required>
                  {(control) => (
                    <Input
                      {...control}
                      ref={refs.latitude}
                      inputMode="decimal"
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Longitud" error={errors.longitude} required>
                  {(control) => (
                    <Input
                      {...control}
                      ref={refs.longitude}
                      inputMode="decimal"
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            </fieldset>
            <div className="flex flex-col gap-3">
              <p id="onboarding-disponibilidad" className="text-sm font-semibold text-ink">
                Disponibilidad inicial
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={isAvailable}
                aria-labelledby="onboarding-disponibilidad"
                onClick={() => setIsAvailable((value) => !value)}
                className={cx(
                  'flex min-h-12 w-full max-w-[220px] items-center gap-3 rounded-full border px-3 font-semibold',
                  isAvailable ? 'border-success bg-success-soft text-success' : 'border-muted bg-neutral-soft text-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx('size-6 rounded-full', isAvailable ? 'bg-success' : 'border-2 border-muted bg-surface')}
                />
                {isAvailable ? 'Disponible' : 'No disponible'}
              </button>
            </div>
            <SaveErrorNotice error={save.error} onReview={review} />
            <div className="flex flex-wrap items-center gap-4">
              <Button ref={submitRef} type="submit" aria-disabled={save.pending}>
                Completar perfil
              </Button>
              <p aria-live="polite" className="text-sm text-muted">
                {save.pending ? 'Guardando tu perfil…' : ''}
              </p>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
