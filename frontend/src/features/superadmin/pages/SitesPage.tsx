import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../../../components/ui/Button.js';
import { Select } from '../../../components/ui/Select.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Alert } from '../../../components/ui/Alert.js';
import { InstitutionForm } from '../components/InstitutionForm.js';
import { ActionNotice, MoreResults, PageIntro, ReadBoundary, useAdminAction, useAdminPage, useAdminRead } from '../components/AdminStates.js';
import { adminPath, hospitalsPage, idPath, sites } from '../httpGateway.js';
import type { Site } from '../types.js';

export function SitesPage() {
  const hospitals = useAdminPage(adminPath + '/hospitals', hospitalsPage);
  const [hospitalId, setHospitalId] = useState('');
  const read = useAdminRead(hospitalId ? adminPath + '/hospitals/' + idPath(hospitalId) + '/sites' : null, sites);
  const action = useAdminAction();
  const [form, setForm] = useState<true | Site | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const closeForm = () => {
    flushSync(() => setForm(null));
    const target = trigger.current?.isConnected ? trigger.current : document.getElementById('sa-create-site');
    target?.focus();
  };
  return <>
    <PageIntro title="Sedes autorizadas" description="Selecciona un hospital para consultar y administrar sus sedes." action={<Button id="sa-create-site" disabled={!hospitalId || !!form || action.pending} onClick={(event) => { trigger.current = event.currentTarget; setForm(true); }}>Nueva sede</Button>} />
    <ReadBoundary {...hospitals}>
      <div className="grid max-w-lg gap-1.5">
        <label htmlFor="sa-site-hospital" className="text-sm font-semibold">Hospital</label>
        <Select id="sa-site-hospital" placeholder="Selecciona un hospital" disabled={!!form || action.pending} value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} options={hospitals.items.map((hospital) => ({ value: hospital.hospitalId, label: hospital.publicName }))} />
      </div>
      <MoreResults {...hospitals} count={hospitals.items.length} />
    </ReadBoundary>
    {form && <InstitutionForm key={form === true ? 'new' : form.siteId} kind="site" {...(form === true ? {} : { editingSite: form })} hospitals={hospitals.items} hospitalId={hospitalId} onSaved={read.retry} onClose={closeForm} />}
    <ActionNotice {...action} />
    {hospitalId ? <ReadBoundary {...read} empty={!read.data?.length}>
      <div className="sa-table-wrap">
        <table role="table" className="sa-table">
          <caption>Sedes del hospital seleccionado</caption>
          <thead><tr>{['Sede', 'Dirección sintética', 'Aprobación', 'Actividad', 'Acciones'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{read.data?.map((site) => <tr key={site.siteId}>
            <td data-label="Sede"><strong>{site.publicName}</strong></td>
            <td data-label="Dirección">{site.publicAddress}<p className="mt-1 text-sm text-muted">{site.publicInstructions || 'Sin instrucciones adicionales'}</p></td>
            <td data-label="Aprobación"><Badge tone={site.isApproved ? 'success' : 'warning'}>{site.isApproved ? 'Aprobada' : 'Sin aprobación'}</Badge></td>
            <td data-label="Actividad">{site.isActive ? 'Activa' : 'Inactiva'}</td>
            <td data-label="Acciones"><div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={action.pending || !!form} aria-label={'Editar sede ' + site.publicName} onClick={(event) => { trigger.current = event.currentTarget; setForm(site); }}>Editar</Button>
              <Button variant="secondary" disabled={action.pending || !!form} onClick={() => { void action.execute(adminPath + '/sites/' + idPath(site.siteId), 'PATCH', { isApproved: !site.isApproved }, read.retry); }}>{site.isApproved ? 'Retirar aprobación' : 'Aprobar'}</Button>
              <Button variant="ghost" disabled={action.pending || !!form} onClick={() => { void action.execute(adminPath + '/sites/' + idPath(site.siteId), 'PATCH', { isActive: !site.isActive }, read.retry); }}>{site.isActive ? 'Desactivar' : 'Activar'}</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </ReadBoundary> : <p role="status">Selecciona un hospital para cargar sus sedes.</p>}
    <Alert tone="info" title="Alcance administrativo"><p>La aprobación y la actividad de una sede son estados independientes. No se muestran ubicaciones personales de donantes.</p></Alert>
  </>;
}
