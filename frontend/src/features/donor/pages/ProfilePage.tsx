import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { cx } from '../../../components/ui/cx.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { bloodTypeLabel } from '../../../lib/format.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { latitudeError, longitudeError } from '../location.js';

type Errors = { latitude?: string; longitude?: string };

const protectedChanges = [
  { title: 'Corregir nombre o grupo', detail: 'Crea una solicitud para revisión.', variant: 'secondary' as const },
  { title: 'Cambiar correo', detail: 'El nuevo correo deberá verificarse.', variant: 'secondary' as const },
  { title: 'Eliminar mis datos', detail: 'Inicia una solicitud auditable.', variant: 'danger' as const },
];

// DON-02 Mi perfil (Penpot «+»). Datos de getOwnDonorProfile. Solo se editan
// disponibilidad y ubicación aproximada (updateOwnDonorParticipation); nombre,
// correo y grupo requieren una solicitud de corrección.
export function ProfilePage() {
  const { profile, updateParticipation } = useDonorDemo();
  const [isAvailable, setIsAvailable] = useState(profile.isAvailable);
  const [latitude, setLatitude] = useState(String(profile.approximateLocation.latitude));
  const [longitude, setLongitude] = useState(String(profile.approximateLocation.longitude));
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {
      latitude: latitudeError(latitude),
      longitude: longitudeError(longitude),
    };
    flushSync(() => {
      setErrors(found);
      setSaved(false);
    });
    if (found.latitude) return latitudeRef.current?.focus();
    if (found.longitude) return longitudeRef.current?.focus();
    updateParticipation({
      isAvailable,
      approximateLocation: { latitude: Number(latitude), longitude: Number(longitude) },
    });
    setSaved(true);
  }

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Administra tu disponibilidad y ubicación sintética aproximada."
        actions={
          <Button type="submit" form="perfil-formulario">
            Guardar cambios
          </Button>
        }
      />
      <Alert tone="brand" title="Tus datos están protegidos">
        Nombre, correo y grupo declarado requieren una solicitud de corrección.
      </Alert>
      <div aria-live="polite">
        {saved && <SuccessNotice announce={false} message="Cambios guardados" detail="Tu disponibilidad y ubicación quedaron actualizadas." />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Datos declarados">
          <form id="perfil-formulario" noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Nombre" hint="Solicita una corrección para modificarlo.">
                {(control) => <Input {...control} readOnly value={profile.name} />}
              </Field>
              <Field label="Correo" hint="Correo verificado.">
                {(control) => <Input {...control} readOnly type="email" value={profile.email} />}
              </Field>
              <Field label="Grupo declarado" hint="Usado solo para preselección.">
                {(control) => <Input {...control} readOnly value={bloodTypeLabel(profile.declaredBloodType)} />}
              </Field>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold text-ink">Ubicación sintética</legend>
              <p className="text-sm text-muted">Máximo tres decimales; no uses tu domicilio real.</p>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Latitud" error={errors.latitude}>
                  {(control) => (
                    <Input
                      {...control}
                      ref={latitudeRef}
                      inputMode="decimal"
                      value={latitude}
                      onChange={(event) => {
                        setLatitude(event.target.value);
                        setSaved(false);
                      }}
                    />
                  )}
                </Field>
                <Field label="Longitud" error={errors.longitude}>
                  {(control) => (
                    <Input
                      {...control}
                      ref={longitudeRef}
                      inputMode="decimal"
                      value={longitude}
                      onChange={(event) => {
                        setLongitude(event.target.value);
                        setSaved(false);
                      }}
                    />
                  )}
                </Field>
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <p id="disponibilidad-etiqueta" className="text-sm font-semibold text-ink">
                Disponibilidad
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={isAvailable}
                aria-labelledby="disponibilidad-etiqueta"
                aria-describedby="disponibilidad-ayuda"
                onClick={() => {
                  setIsAvailable((value) => !value);
                  setSaved(false);
                }}
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
              <p id="disponibilidad-ayuda" className="text-sm text-muted">
                Al marcarte no disponible, no recibirás nuevas invitaciones y se invalidarán las activas sin respuesta.
              </p>
            </div>
          </form>
        </Card>

        <Card title="Cambios protegidos">
          <ul className="flex flex-col gap-6">
            {protectedChanges.map((item) => (
              <li key={item.title} className="flex flex-col items-start gap-2">
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="text-sm text-muted">{item.detail}</p>
                <LinkButton to="/donante/solicitudes" variant={item.variant}>
                  Ver mis solicitudes<span className="sr-only">: {item.title.toLowerCase()}</span>
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
