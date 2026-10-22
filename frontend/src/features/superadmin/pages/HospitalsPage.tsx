import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { StatCard } from '../../../components/ui/StatCard.js';
import { formatDateTime } from '../../../lib/format.js';
import { ResultNotice, type Notice } from '../components/ResultNotice.js';
import { useStepUpGate } from '../components/StepUpPanel.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';

type Errors = { publicName?: string; legalName?: string };

const required = (value: string, max: number, name: string) =>
  !value.trim() ? `Ingresa ${name}.` : value.trim().length > max ? `Usa como máximo ${max} caracteres.` : undefined;

// SA-02 Hospitales autorizados (Penpot «+»). Datos de listHospitals; sedes y
// administradores se cuentan desde sus propias listas. Crear usa
// createHospital; autorizar o desautorizar usa updateHospital, que exige
// step-up. Sin backend (D-4).
export function HospitalsPage() {
  const { hospitals, sites, memberships, createHospital, setHospitalAuthorized } = useSuperadminDemo();
  const { requireStepUp, stepUpPanel } = useStepUpGate();
  const [publicName, setPublicName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const publicRef = useRef<HTMLInputElement>(null);
  const legalRef = useRef<HTMLInputElement>(null);

  const activeSites = (hospitalId: string) => sites.filter((s) => s.hospitalId === hospitalId && s.isActive).length;
  const admins = (hospitalId: string) =>
    memberships.filter((m) => m.hospitalId === hospitalId && m.status === 'activa').length;

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {
      publicName: required(publicName, 160, 'el nombre público'),
      legalName: required(legalName, 200, 'la razón social'),
    };
    flushSync(() => setErrors(found));
    if (found.publicName) return publicRef.current?.focus();
    if (found.legalName) return legalRef.current?.focus();
    const created = createHospital({ publicName: publicName.trim(), legalName: legalName.trim() });
    setPublicName('');
    setLegalName('');
    setNotice({ message: `${created.publicName} creado`, detail: 'Queda sin autorizar hasta que lo autorices.' });
  }

  function toggle(hospitalId: string, name: string, authorize: boolean) {
    requireStepUp(authorize ? `autorizar ${name}` : `desautorizar ${name}`, () => {
      setHospitalAuthorized(hospitalId, authorize);
      setNotice({
        message: authorize ? `${name} autorizado` : `${name} desautorizado`,
        detail: 'El cambio quedó registrado en la auditoría.',
      });
    });
  }

  return (
    <>
      <PageHeader
        title="Hospitales autorizados"
        description="Gestiona instituciones verificadas y su estado operativo."
        actions={<Button onClick={() => publicRef.current?.focus()}>Nuevo hospital</Button>}
      />
      <Alert tone="brand" title="Control central">
        Solo el superadmin puede crear o modificar hospitales y aprobar sus sedes.
      </Alert>
      {stepUpPanel}
      <ResultNotice notice={notice} />

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[880px] text-left">
          <caption className="sr-only">Hospitales</caption>
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="px-4 py-4 font-semibold">Hospital</th>
              <th scope="col" className="px-4 py-4 font-semibold">Razón social</th>
              <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-4 font-semibold">Sedes activas</th>
              <th scope="col" className="px-4 py-4 font-semibold">Administradores</th>
              <th scope="col" className="px-4 py-4 font-semibold">Creado</th>
              <th scope="col" className="px-4 py-4 font-semibold"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {hospitals.map((hospital) => (
              <tr key={hospital.hospitalId} className="text-ink">
                <th scope="row" className="px-4 py-4 font-semibold">{hospital.publicName}</th>
                <td className="px-4 py-4">{hospital.legalName ?? '—'}</td>
                <td className="px-4 py-4">
                  <Badge tone={hospital.isAuthorized ? 'success' : 'neutral'}>
                    {hospital.isAuthorized ? 'Autorizado' : 'No autorizado'}
                  </Badge>
                </td>
                <td className="px-4 py-4">{activeSites(hospital.hospitalId)}</td>
                <td className="px-4 py-4">{admins(hospital.hospitalId)}</td>
                <td className="px-4 py-4">{formatDateTime(hospital.createdAt)}</td>
                <td className="px-4 py-4 text-right">
                  <Button
                    variant={hospital.isAuthorized ? 'danger' : 'secondary'}
                    onClick={() => toggle(hospital.hospitalId, hospital.publicName, !hospital.isAuthorized)}
                  >
                    {hospital.isAuthorized ? 'Desautorizar' : 'Autorizar'}
                    <span className="sr-only"> {hospital.publicName}</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="resumen-institucional" className="flex flex-col gap-4">
        <h2 id="resumen-institucional" className="text-xl font-semibold text-ink">
          Resumen institucional
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard value={hospitals.filter((h) => h.isAuthorized).length} label="Hospitales autorizados" accent="petrol" />
          <StatCard value={sites.filter((s) => s.isActive).length} label="Sedes activas" accent="success" />
          <StatCard value={memberships.filter((m) => m.status === 'activa').length} label="Administradores activos" accent="danger" />
        </div>
      </section>

      <Card title="Crear hospital">
        <form noValidate onSubmit={handleCreate} className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Nombre público" error={errors.publicName} required>
              {(control) => (
                <Input {...control} ref={publicRef} value={publicName} onChange={(event) => setPublicName(event.target.value)} />
              )}
            </Field>
            <Field label="Razón social" error={errors.legalName} required>
              {(control) => (
                <Input {...control} ref={legalRef} value={legalName} onChange={(event) => setLegalName(event.target.value)} />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit">Crear hospital</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
