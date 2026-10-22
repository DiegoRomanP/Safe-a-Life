import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import type { Tone } from '../../../components/ui/tones.js';
import { latitudeError, longitudeError } from '../../donor/location.js';
import { ResultNotice, type Notice } from '../components/ResultNotice.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';
import type { Site } from '../types.js';

type SiteState = 'activa' | 'revision' | 'inactiva';

function stateOf(site: Site): SiteState {
  if (!site.isApproved) return 'revision';
  return site.isActive ? 'activa' : 'inactiva';
}

const stateLabel: Record<SiteState, { label: string; tone: Tone }> = {
  activa: { label: 'Activa', tone: 'success' },
  revision: { label: 'En revisión', tone: 'warning' },
  inactiva: { label: 'Inactiva', tone: 'neutral' },
};

type Errors = Partial<Record<'hospital' | 'name' | 'address' | 'latitude' | 'longitude', string>>;

// SA-03 Sedes autorizadas (contenido de Penpot «SaL» con estilo «+»). Datos de
// listHospitalSites; los filtros se aplican sobre las sedes cargadas. Crear usa
// createHospitalSite (queda en revisión) y aprobar usa updateHospitalSite. Las
// sedes son datos públicos del hospital: no incluyen donantes. Sin backend (D-4).
export function SitesPage() {
  const { hospitals, sites, createSite, approveSite } = useSuperadminDemo();
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ hospital: '', name: '', address: '', latitude: '', longitude: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const refs = {
    hospital: useRef<HTMLSelectElement>(null),
    name: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
    latitude: useRef<HTMLInputElement>(null),
    longitude: useRef<HTMLInputElement>(null),
  };
  const hospitalName = (hospitalId: string) => hospitals.find((h) => h.hospitalId === hospitalId)?.publicName ?? '—';
  const hospitalOptions = hospitals.map((h) => ({ value: h.hospitalId, label: h.publicName }));

  const visible = sites.filter(
    (site) =>
      (!hospitalFilter || site.hospitalId === hospitalFilter) &&
      (!stateFilter || stateOf(site) === stateFilter) &&
      site.publicName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = (value: string, max: number, name: string) =>
      !value.trim() ? `Ingresa ${name}.` : value.trim().length > max ? `Usa como máximo ${max} caracteres.` : undefined;
    const found: Errors = {
      hospital: form.hospital ? undefined : 'Selecciona el hospital.',
      name: text(form.name, 160, 'el nombre de la sede'),
      address: text(form.address, 240, 'la dirección pública'),
      latitude: latitudeError(form.latitude),
      longitude: longitudeError(form.longitude),
    };
    flushSync(() => setErrors(found));
    const first = (Object.keys(refs) as Array<keyof Errors>).find((key) => found[key]);
    if (first) return refs[first].current?.focus();
    const created = createSite({
      hospitalId: form.hospital,
      publicName: form.name.trim(),
      publicAddress: form.address.trim(),
      coordinates: { latitude: Number(form.latitude), longitude: Number(form.longitude) },
    });
    setForm({ hospital: '', name: '', address: '', latitude: '', longitude: '' });
    setNotice({ message: `${created.publicName} creada`, detail: 'Queda en revisión hasta que la apruebes.' });
  }

  return (
    <>
      <PageHeader
        title="Sedes autorizadas"
        description="Gestiona sedes vinculadas a hospitales autorizados."
        actions={<Button onClick={() => refs.hospital.current?.focus()}>Nueva sede</Button>}
      />
      <ResultNotice notice={notice} />

      <section aria-label="Filtros" className="grid gap-4 rounded-xl border border-line bg-surface p-4 md:grid-cols-3">
        <Field label="Hospital">
          {(control) => (
            <Select
              {...control}
              options={[{ value: '', label: 'Todos los hospitales' }, ...hospitalOptions]}
              value={hospitalFilter}
              onChange={(event) => setHospitalFilter(event.target.value)}
            />
          )}
        </Field>
        <Field label="Estado">
          {(control) => (
            <Select
              {...control}
              options={[
                { value: '', label: 'Cualquier estado' },
                { value: 'activa', label: 'Activa' },
                { value: 'revision', label: 'En revisión' },
                { value: 'inactiva', label: 'Inactiva' },
              ]}
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            />
          )}
        </Field>
        <Field label="Buscar sede">
          {(control) => (
            <Input {...control} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          )}
        </Field>
      </section>

      <p aria-live="polite" className="text-sm text-muted">
        {`${visible.length} ${visible.length === 1 ? 'sede' : 'sedes'}`}
      </p>
      {visible.length === 0 ? (
        <EmptyState message="No hay sedes con esos filtros" detail="Cambia el hospital, el estado o la búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left">
            <caption className="sr-only">Sedes</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-4 py-4 font-semibold">Sede</th>
                <th scope="col" className="px-4 py-4 font-semibold">Hospital</th>
                <th scope="col" className="px-4 py-4 font-semibold">Dirección pública</th>
                <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-4 font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((site) => {
                const state = stateLabel[stateOf(site)];
                return (
                  <tr key={site.siteId} className="text-ink">
                    <th scope="row" className="px-4 py-4 font-semibold">{site.publicName}</th>
                    <td className="px-4 py-4">{hospitalName(site.hospitalId)}</td>
                    <td className="px-4 py-4">{site.publicAddress ?? '—'}</td>
                    <td className="px-4 py-4">
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {!site.isApproved && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            approveSite(site.siteId);
                            setNotice({ message: `${site.publicName} aprobada`, detail: 'La sede quedó activa.' });
                          }}
                        >
                          Aprobar<span className="sr-only"> {site.publicName}</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Card title="Nueva sede">
        <form noValidate onSubmit={handleCreate} className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Hospital" error={errors.hospital} required>
              {(control) => (
                <Select
                  {...control}
                  ref={refs.hospital}
                  placeholder="Selecciona un hospital"
                  options={hospitalOptions}
                  value={form.hospital}
                  onChange={(event) => update('hospital', event.target.value)}
                />
              )}
            </Field>
            <Field label="Nombre de la sede" error={errors.name} required>
              {(control) => (
                <Input {...control} ref={refs.name} value={form.name} onChange={(event) => update('name', event.target.value)} />
              )}
            </Field>
            <Field label="Dirección pública" hint="Dirección de la sede, no de personas." error={errors.address} required>
              {(control) => (
                <Input
                  {...control}
                  ref={refs.address}
                  value={form.address}
                  onChange={(event) => update('address', event.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Latitud" error={errors.latitude} required>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.latitude}
                    inputMode="decimal"
                    value={form.latitude}
                    onChange={(event) => update('latitude', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Longitud" error={errors.longitude} required>
                {(control) => (
                  <Input
                    {...control}
                    ref={refs.longitude}
                    inputMode="decimal"
                    value={form.longitude}
                    onChange={(event) => update('longitude', event.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
          <div>
            <Button type="submit">Crear sede</Button>
          </div>
        </form>
      </Card>

      <Alert tone="info" title="Alcance administrativo">
        Las sedes no incluyen datos de donantes ni ubicaciones personales.
      </Alert>
    </>
  );
}
