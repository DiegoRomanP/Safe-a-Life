
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  apiRequest,
  ApiError,
  createMutationIntent,
  errorMessage,
} from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LinkButton } from '../../../components/ui/LinkButton.js';
import { bloodTypeLabel, type BloodType } from '../../../lib/format.js';
import type { DonorProfile } from '../types.js';

type PageState =
  | 'loading'
  | 'onboarding'
  | 'active'
  | 'loading-error';

const bloodTypes: BloodType[] = [
  'O_NEG',
  'O_POS',
  'A_NEG',
  'A_POS',
  'B_NEG',
  'B_POS',
  'AB_NEG',
  'AB_POS',
];

const coord = /^-?\d{1,3}(\.\d{1,3})?$/;

function readLocation(latitude: string, longitude: string) {
  const latitudeText = latitude.trim();
  const longitudeText = longitude.trim();

  if (!coord.test(latitudeText) || !coord.test(longitudeText)) {
    throw new Error(
      'Escribe latitud y longitud con un máximo de tres decimales.'
    );
  }

  const lat = Number(latitudeText);
  const lon = Number(longitudeText);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    throw new Error('Las coordenadas están fuera del rango permitido.');
  }

  return {
    latitude: lat,
    longitude: lon,
  };
}

export function ProfilePage() {
  const [mode, setMode] = useState<PageState>('loading');
  const [profile, setProfile] = useState<DonorProfile | null>(null);

  const [name, setName] = useState('');
  const [blood, setBlood] = useState<BloodType>('O_POS');
  const [available, setAvailable] = useState(true);

  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const intent = useRef(createMutationIntent());

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<DonorProfile>('/api/v1/donors/me/profile', {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;

        setProfile(data);
        setName(data.name);
        setBlood(data.declaredBloodType);
        setAvailable(data.isAvailable);

        setLatitude(String(data.approximateLocation.latitude));
        setLongitude(String(data.approximateLocation.longitude));

        setMode('active');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        if (error instanceof ApiError && error.status === 404) {
          setMode('onboarding');
        } else {
          setMode('loading-error');
          setMessage(errorMessage(error));
        }
      });

    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setSaved(false);
    setMessage('');

    try {
      const approximateLocation = readLocation(latitude, longitude);
      const creating = mode === 'onboarding';

      if (creating && name.trim().length < 2) {
        throw new Error('Ingresa tu nombre completo.');
      }

      const path = creating
        ? '/api/v1/donors/me/onboarding-profile'
        : '/api/v1/donors/me/profile';

      const body = creating
        ? {
            name: name.trim(),
            declaredBloodType: blood,
            isAvailable: available,
            approximateLocation,
          }
        : {
            isAvailable: available,
            approximateLocation,
          };

      setBusy(true);

      const data = await apiRequest<DonorProfile>(path, {
        method: creating ? 'PUT' : 'PATCH',
        body,
        idempotencyKey: intent.current.keyFor(path, body),
      });

      intent.current.reset();

      setProfile(data);
      setName(data.name);
      setBlood(data.declaredBloodType);
      setAvailable(data.isAvailable);

      setLatitude(String(data.approximateLocation.latitude));
      setLongitude(String(data.approximateLocation.longitude));

      setMode('active');
      setSaved(true);
    } catch (error) {
      if (error instanceof Error && !(error instanceof ApiError)) {
        setMessage(error.message);
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        mode === 'onboarding'
      ) {
        setMessage(
          'El servidor todavía exige completar la configuración de contraseña ' +
          'antes de activar tu perfil. Este requisito debe resolverse mediante ' +
          'el flujo de seguridad de tu cuenta.'
        );
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'loading') {
    return (
      <PageHeader
        title="Mi perfil"
        description="Cargando información de tu cuenta…"
      />
    );
  }

  if (mode === 'loading-error') {
    return (
      <>
        <PageHeader
          title="Mi perfil"
          description="No pudimos consultar tu perfil real."
        />

        <Alert tone="warning" title="No fue posible cargar los datos">
          {message}
        </Alert>

        <Button onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </>
    );
  }

  const creating = mode === 'onboarding';

  return (
    <>
      <PageHeader
        title={creating ? 'Completar perfil de donante' : 'Mi perfil'}
        description={
          creating
            ? 'Configura tus datos iniciales para activar la participación.'
            : 'Actualiza tu disponibilidad y ubicación aproximada.'
        }
        actions={
          <Button
            type="submit"
            form="perfil-real"
            disabled={busy}
          >
            {busy
              ? 'Guardando…'
              : creating
                ? 'Completar perfil'
                : 'Guardar cambios'}
          </Button>
        }
      />

      {creating ? (
        <Alert tone="info" title="Perfil todavía incompleto">
          Completa tus datos iniciales. La información será validada
          por el servidor antes de guardarse en PostgreSQL.
        </Alert>
      ) : (
        <Alert tone="brand" title="Datos protegidos">
          Después de activar el perfil, el nombre y el grupo sanguíneo
          no se modifican directamente. Debes solicitar una corrección.
        </Alert>
      )}

      <div aria-live="polite">
        {message && (
          <Alert tone="warning" title="No se pudieron guardar los datos">
            {message}
          </Alert>
        )}

        {saved && (
          <SuccessNotice
            announce={false}
            message="Cambios guardados"
            detail="Información confirmada por el servidor."
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Datos del donante">
          <form
            id="perfil-real"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="flex flex-col gap-6"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Nombre">
                {(control) => (
                  <Input
                    {...control}
                    value={name}
                    readOnly={!creating}
                    required={creating}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Correo">
                {(control) => (
                  <Input
                    {...control}
                    type="text"
                    readOnly
                    value={
                      profile?.email ??
                      'Correo de la cuenta autenticada'
                    }
                  />
                )}
              </Field>

              <Field label="Grupo sanguíneo declarado">
                {(control) =>
                  creating ? (
                    <select
                      {...control}
                      className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-ink"
                      value={blood}
                      onChange={(event) =>
                        setBlood(event.target.value as BloodType)
                      }
                    >
                      {bloodTypes.map((item) => (
                        <option key={item} value={item}>
                          {bloodTypeLabel(item)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      {...control}
                      readOnly
                      value={bloodTypeLabel(blood)}
                    />
                  )
                }
              </Field>
            </div>

            <p className="text-sm text-muted">
              Ubicación sintética aproximada: máximo tres decimales.
              No ingreses tu domicilio real.
            </p>

            <div className="grid gap-6 md:grid-cols-2">
            <Field label="Latitud">
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  placeholder="-12.046"
                  value={latitude}
                  onChange={(e) => {
                    const value = e.target.value.replace(',', '.');

                    if (/^-?\d{0,2}(\.\d{0,3})?$/.test(value) || value === '-') {
                      setLatitude(value);
                    }
                  }}
                  required
                />
              )}
            </Field>

            <Field label="Longitud">
              {(control) => (
                <Input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  placeholder="-77.043"
                  value={longitude}
                  onChange={(e) => {
                    const value = e.target.value.replace(',', '.');

                    if (/^-?\d{0,3}(\.\d{0,3})?$/.test(value) || value === '-') {
                      setLongitude(value);
                    }
                  }}
                  required
                />
              )}
            </Field>
          </div>

            <label className="flex items-center gap-3 text-ink">
              <input
                type="checkbox"
                checked={available}
                onChange={(event) =>
                  setAvailable(event.target.checked)
                }
              />

              Disponible para recibir invitaciones
            </label>
          </form>
        </Card>

        <Card title="Cambios protegidos">
          <p className="text-muted">
            Para corregir el nombre, el grupo sanguíneo o el correo
            de un perfil activo, utiliza el flujo de solicitudes.
          </p>

          <LinkButton
            to="/donante/solicitudes"
            variant="secondary"
          >
            Ver mis solicitudes
          </LinkButton>
        </Card>
      </div>
    </>
  );
}
