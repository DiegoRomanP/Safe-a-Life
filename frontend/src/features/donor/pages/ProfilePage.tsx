import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { QueryView } from '../../../components/states/QueryView.js';
import { SaveErrorNotice } from '../../../components/states/SaveErrorNotice.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { Switch } from '../../../components/ui/Switch.js';
import { bloodTypeLabel } from '../../../lib/format.js';
import { useDemoMutation, type Mutation } from '../../../lib/useDemoMutation.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { useDonorDemo } from '../DonorDemoContext.js';
import { AddressSearch } from '../AddressSearch.js';
import { latitudeError, longitudeError } from '../location.js';
import type { DonorProfile } from '../types.js';
import type { RequestKind } from './NewRequestPage.js';

type Errors = { latitude?: string; longitude?: string };

// Cada cambio abre «Nueva solicitud» con su tipo ya elegido.
const protectedChanges: Array<{
  title: string;
  detail: string;
  variant: 'secondary' | 'danger';
  kind: RequestKind;
}> = [
  { title: 'Corregir nombre o grupo', detail: 'Crea una solicitud para revisión.', variant: 'secondary', kind: 'correccion' },
  { title: 'Cambiar correo', detail: 'El nuevo correo deberá verificarse.', variant: 'secondary', kind: 'correo' },
  { title: 'Eliminar mis datos', detail: 'Inicia una solicitud auditable.', variant: 'danger', kind: 'eliminacion' },
];

// DON-02 Mi perfil (Penpot «+»). Datos reales de getOwnDonorProfile. Solo se editan
// disponibilidad y ubicación aproximada (updateOwnDonorParticipation); nombre,
// correo y grupo requieren una solicitud de corrección.
export function ProfilePage() {
  const { scenario, getProfile, updateParticipation } = useDonorDemo();
  const query = useDemoQuery(getProfile, scenario);
  // La escritura vive aquí para que el botón de la cabecera refleje el envío.
  const save = useDemoMutation(updateParticipation);

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Administra tu disponibilidad y ubicación sintética aproximada."
      />
      <Alert tone="info" title="Tus datos están protegidos">
        Nombre, correo y grupo declarado requieren una solicitud de corrección.
      </Alert>
      <QueryView query={query} loadingMessage="Cargando tu perfil…" backTo="/donante/invitaciones" backLabel="Ir a mis invitaciones">
        {(profile, reload) => !profile ? (
          // Sin perfil activo (404) el siguiente paso es completar el onboarding.
          <Navigate to="/donante/bienvenida" replace />
        ) : (
          // Revisar un conflicto vuelve a «Cargando», así que el formulario se
          // monta de nuevo con los datos que llegan del reintento.
          <ProfileForm
            profile={profile}
            save={save}
            onReload={() => {
              save.reset();
              reload();
            }}
          />
        )}
      </QueryView>
    </>
  );
}

type ProfileFormProps = {
  profile: DonorProfile;
  save: Mutation<[Pick<DonorProfile, 'isAvailable' | 'approximateLocation'>], void>;
  onReload: () => void;
};

function ProfileForm({ profile, save, onReload }: ProfileFormProps) {
  const [isAvailable, setIsAvailable] = useState(profile.isAvailable);
  const [latitude, setLatitude] = useState(String(profile.approximateLocation.latitude));
  const [longitude, setLongitude] = useState(String(profile.approximateLocation.longitude));
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.pending) return;
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
    const result = await save.run({
      isAvailable,
      approximateLocation: { latitude: Number(latitude), longitude: Number(longitude) },
    });
    if (result.ok) setSaved(true);
  }

  return (
    <>
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
              <AddressSearch onSelect={(lat, lon) => { setLatitude(lat); setLongitude(lon); setSaved(false); }} />
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
              <Switch
                checked={isAvailable}
                labelledBy="disponibilidad-etiqueta"
                describedBy="disponibilidad-ayuda"
                onChange={(next) => {
                  setIsAvailable(next);
                  setSaved(false);
                }}
              />
              <p id="disponibilidad-ayuda" className="text-sm text-muted">
                Al marcarte no disponible, no recibirás nuevas invitaciones y se invalidarán las activas sin respuesta.
              </p>
            </div>

            {/* Acción y resultado junto a los campos editables: en móvil la cabecera queda a una pantalla de distancia. */}
            <div className="flex flex-col items-start gap-4 border-t border-line pt-6">
              <Button type="submit" aria-disabled={save.pending}>
                {save.pending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              <div aria-live="polite" className="live-slot w-full">
                {saved && <SuccessNotice announce={false} message="Cambios guardados" detail="Tu disponibilidad y ubicación quedaron actualizadas." />}
              </div>
              <SaveErrorNotice error={save.error} onReview={onReload} />
            </div>
          </form>
        </Card>

        <Card title="Cambios protegidos">
          <ul className="flex flex-col gap-6">
            {protectedChanges.map((item) => (
              <li key={item.title} className="flex flex-col items-start gap-2">
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="text-sm text-muted">{item.detail}</p>
                <LinkButton to="/donante/solicitudes/nueva" state={{ kind: item.kind }} variant={item.variant}>
                  Crear solicitud<span className="sr-only">: {item.title.toLowerCase()}</span>
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
