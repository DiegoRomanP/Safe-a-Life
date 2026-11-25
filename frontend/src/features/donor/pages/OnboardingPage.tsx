import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Switch } from '../../../components/ui/Switch.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { Select } from '../../../components/ui/Select.js';
import { BLOOD_TYPES, bloodTypeLabel, type BloodType } from '../../../lib/format.js';
import { useDemoMutation } from '../../../lib/useDemoMutation.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { mapboxEnabled } from '../../../lib/mapbox.js';
import { AddressSearch } from '../AddressSearch.js';
import { LocationMap } from '../LocationMap.js';
import { latitudeError, longitudeError } from '../location.js';

type Errors = { name?: string; bloodType?: string; latitude?: string; longitude?: string };

const bloodTypeOptions = BLOOD_TYPES.map((value) => ({ value, label: bloodTypeLabel(value) }));

// DON-01 Bienvenida y onboarding (contenido de Penpot «SaL» con estilo «+»).
// Completa los campos obligatorios de completeDonorOnboarding: nombre, grupo
// declarado, disponibilidad y ubicación aproximada, y se guarda en el backend.
export function OnboardingPage() {
  const { completeOnboarding } = useDonorDemo();
  const save = useDemoMutation(completeOnboarding);
  const [name, setName] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const submitRef = useRef<HTMLButtonElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
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
      // Con Mapbox no hay campos de coordenadas: basta con haber elegido una dirección.
      latitude: mapboxEnabled ? (latitude ? undefined : 'Busca tu dirección y elige una opción.') : latitudeError(latitude),
      longitude: mapboxEnabled ? undefined : longitudeError(longitude),
    };
    flushSync(() => setErrors(found));
    const first = (Object.keys(refs) as Array<keyof Errors>).find((key) => found[key]);
    if (first) return (mapboxEnabled && first === 'latitude' ? addressRef : refs[first]).current?.focus();
    // Al guardarse, DonorLayout detecta el perfil y lleva a Invitaciones: esta página no navega por sí misma.
    await save.run({
      name: name.trim(),
      declaredBloodType: bloodType as BloodType,
      isAvailable,
      approximateLocation: { latitude: Number(latitude), longitude: Number(longitude) },
    });
  }

  // Elegir un punto (búsqueda o mapa) resuelve el error de ubicación sin esperar al envío.
  function chooseLocation(lat: string, lon: string) {
    setLatitude(lat);
    setLongitude(lon);
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
  }

  // El aviso de conflicto desaparece al revisarlo: el foco vuelve al envío.
  function review() {
    flushSync(save.reset);
    submitRef.current?.focus();
  }

  return (
    <>
      <PageHeader
        title="Te damos la bienvenida"
        description="Completa lo esencial para recibir invitaciones de hospitales autorizados."
      />
      <Alert tone="warning" title="Antes de recibir una invitación">
        El grupo es declarado y la ubicación es aproximada. Ninguno determina elegibilidad médica.
      </Alert>

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
              {!mapboxEnabled && <p className="text-sm text-muted">Máximo tres decimales; no uses tu domicilio real.</p>}
              <AddressSearch inputRef={addressRef} error={errors.latitude} onSelect={chooseLocation} />
              <LocationMap latitude={latitude} longitude={longitude} onChange={chooseLocation} />
              {!mapboxEnabled && (
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
              )}
            </fieldset>
            <div className="flex flex-col gap-3">
              <p id="onboarding-disponibilidad" className="text-sm font-semibold text-ink">
                Disponibilidad inicial
              </p>
              <Switch checked={isAvailable} labelledBy="onboarding-disponibilidad" onChange={setIsAvailable} />
            </div>
            {save.error === 'conflicto' ? (
              // completeDonorOnboarding responde 409 si el perfil ya está activo: no hay nada que revisar aquí.
              <Alert tone="info" title="Tu perfil ya está completo">
                <LinkButton to="/donante/perfil" variant="secondary">Ir a mi perfil</LinkButton>
              </Alert>
            ) : (
              <SaveErrorNotice error={save.error} onReview={review} />
            )}
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
    </>
  );
}
