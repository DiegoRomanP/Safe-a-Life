import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { Card } from '../../../components/ui/Card.js';
import type { Hospital, Site } from '../types.js';
import { adminPath, idPath } from '../httpGateway.js';
import { ActionNotice, useAdminAction } from './AdminStates.js';

export type InstitutionFormKind = 'hospital' | 'site' | 'administrator';
type InstitutionFormProps = {
  kind: InstitutionFormKind;
  editing?: Hospital;
  editingSite?: Site;
  hospitals?: Hospital[];
  hospitalId?: string;
  onClose: () => void;
  onSaved: () => void;
};

function validCoordinate(value: string, maximum: number): boolean {
  return /^-?\d+(?:\.\d{1,6})?$/.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= maximum;
}

export function InstitutionForm({ kind, editing, editingSite, hospitals = [], hospitalId: selectedHospital = '', onClose, onSaved }: InstitutionFormProps) {
  const [name, setName] = useState(editing?.publicName ?? editingSite?.publicName ?? '');
  const [legalName, setLegalName] = useState(editing?.legalName ?? '');
  const [hospitalId, setHospitalId] = useState(editingSite?.hospitalId ?? selectedHospital);
  const [address, setAddress] = useState(editingSite?.publicAddress ?? '');
  const [latitude, setLatitude] = useState(editingSite ? String(editingSite.coordinates.latitude) : '');
  const [longitude, setLongitude] = useState(editingSite ? String(editingSite.coordinates.longitude) : '');
  const [instructions, setInstructions] = useState(editingSite?.publicInstructions ?? '');
  const [authorized, setAuthorized] = useState(editing?.isAuthorized ?? false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const action = useAdminAction();
  const isEditing = !!editing || !!editingSite;
  const title = kind === 'hospital' ? (editing ? 'Editar hospital' : 'Crear hospital') : kind === 'site' ? (editingSite ? 'Editar sede' : 'Nueva sede') : 'Invitar administrador';
  useEffect(() => { nameRef.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const requiresHospital = kind === 'administrator' || (kind === 'site' && !editingSite);
    const hospitalIsAuthorized = hospitals.some((hospital) => hospital.hospitalId === hospitalId && hospital.isAuthorized);
    if (!name.trim() || (kind === 'hospital' && !legalName.trim()) || (requiresHospital && !hospitalIsAuthorized)) {
      setError('Completa los campos obligatorios y selecciona un hospital autorizado.');
      nameRef.current?.focus();
      return;
    }
    if (kind === 'site' && (!address.trim() || !validCoordinate(latitude, 90) || !validCoordinate(longitude, 180))) {
      setError('Ingresa una dirección y coordenadas válidas, con un máximo de seis decimales.');
      return;
    }
    setError('');
    let path: string;
    let body: unknown;
    if (kind === 'hospital') {
      path = adminPath + '/hospitals' + (editing ? '/' + idPath(editing.hospitalId) : '');
      body = { publicName: name.trim(), legalName: legalName.trim(), ...(editing ? { isAuthorized: authorized } : {}) };
    } else if (kind === 'site') {
      path = editingSite ? adminPath + '/sites/' + idPath(editingSite.siteId) : adminPath + '/hospitals/' + idPath(hospitalId) + '/sites';
      body = {
        publicName: name.trim(), publicAddress: address.trim(),
        coordinates: { latitude: Number(latitude), longitude: Number(longitude) },
        ...(editingSite || instructions.trim() ? { publicInstructions: instructions.trim() } : {}),
      };
    } else {
      path = adminPath + '/hospital-admin-invitations';
      body = { email: name.trim(), hospitalId };
    }
    const saved = await action.execute(path, isEditing ? 'PATCH' : 'POST', body, onSaved);
    if (saved && !isEditing) {
      setName(''); setLegalName(''); setAddress(''); setLatitude(''); setLongitude(''); setInstructions('');
    }
  }

  return <Card title={title}>
    <form className="sa-form" onSubmit={(event) => { void submit(event); }}>
      <p className="text-sm text-muted">Prototipo académico: utiliza únicamente datos sintéticos. Los cambios se guardan mediante el servidor.</p>
      <div className="grid gap-1.5">
        <label htmlFor="institution-name">{kind === 'administrator' ? 'Correo sintético' : 'Nombre público'} *</label>
        <Input ref={nameRef} id="institution-name" type={kind === 'administrator' ? 'email' : 'text'} required maxLength={kind === 'administrator' ? 254 : 160} value={name} onChange={(event) => setName(event.target.value)} disabled={action.pending} aria-invalid={!!error} aria-describedby={error ? 'institution-error' : undefined} />
      </div>
      {kind === 'hospital' && <div className="grid gap-1.5">
        <label htmlFor="institution-legal">Razón social sintética *</label>
        <Input id="institution-legal" required maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} disabled={action.pending} />
      </div>}
      {kind !== 'hospital' && !editingSite && <div className="grid gap-1.5">
        <label htmlFor="institution-hospital">Hospital autorizado *</label>
        <Select id="institution-hospital" required placeholder="Selecciona un hospital" value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} disabled={action.pending} options={hospitals.filter((hospital) => hospital.isAuthorized).map((hospital) => ({ value: hospital.hospitalId, label: hospital.publicName }))} />
      </div>}
      {editingSite && <p className="text-sm text-muted">Hospital: {hospitals.find((hospital) => hospital.hospitalId === editingSite.hospitalId)?.publicName ?? editingSite.hospitalId}. Esta edición conserva la aprobación y la actividad de la sede.</p>}
      {kind === 'site' && <>
        <div className="grid gap-1.5">
          <label htmlFor="institution-address">Dirección pública sintética *</label>
          <Input id="institution-address" required maxLength={240} value={address} onChange={(event) => setAddress(event.target.value)} disabled={action.pending} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="institution-latitude">Latitud de la sede sintética *</label>
            <Input id="institution-latitude" type="number" step="0.000001" min="-90" max="90" required value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={action.pending} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="institution-longitude">Longitud de la sede sintética *</label>
            <Input id="institution-longitude" type="number" step="0.000001" min="-180" max="180" required value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={action.pending} />
          </div>
        </div>
        <p className="text-sm text-muted">Hasta seis decimales. Corresponde a la sede; nunca a la ubicación de un donante.</p>
        <div className="grid gap-1.5">
          <label htmlFor="institution-instructions">Instrucciones públicas sintéticas</label>
          <Input id="institution-instructions" maxLength={1000} value={instructions} onChange={(event) => setInstructions(event.target.value)} disabled={action.pending} />
        </div>
      </>}
      {editing && <div className="grid gap-1.5">
        <label htmlFor="institution-authorized">Autorización</label>
        <Select id="institution-authorized" value={String(authorized)} onChange={(event) => setAuthorized(event.target.value === 'true')} disabled={action.pending} options={[{ value: 'true', label: 'Autorizado' }, { value: 'false', label: 'Sin autorización' }]} />
      </div>}
      {kind === 'hospital' && !editing && <p className="text-sm text-muted">El hospital se crea sin autorización. Después puedes editarlo para autorizar su operación.</p>}
      {kind === 'administrator' && <p className="text-sm text-muted">La respuesta de aceptación es neutra. La entrega depende del proveedor de correo configurado; no confirma que la persona haya recibido o aceptado la invitación.</p>}
      {error && <p role="alert" id="institution-error" className="text-danger">{error}</p>}
      <ActionNotice {...action} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={action.pending}>{action.pending ? 'Guardando…' : kind === 'administrator' ? 'Enviar invitación' : 'Guardar'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={action.pending}>Cerrar formulario</Button>
      </div>
    </form>
  </Card>;
}
