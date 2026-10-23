import { useRef, useState } from 'react';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Alert } from '../../../components/ui/Alert.js';
import { InstitutionForm } from '../components/InstitutionForm.js';
import { MoreResults, PageIntro, ReadBoundary, useAdminPage } from '../components/AdminStates.js';
import { adminPath, hospitalsPage } from '../httpGateway.js';
import { formatLima } from '../format.js';
import type { Hospital } from '../types.js';

export function HospitalsPage() {
  const read = useAdminPage(adminPath + '/hospitals', hospitalsPage);
  const [form, setForm] = useState<true | Hospital | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return <>
    <PageIntro title="Hospitales autorizados" description="Gestiona instituciones sintéticas y su autorización operativa." action={<Button onClick={(event) => { trigger.current = event.currentTarget; setForm(true); }}>Crear hospital</Button>} />
    <Alert tone="brand" title="Control central"><p>Solo el superadmin puede gestionar hospitales. Autorizar o modificar un hospital requiere autenticación reforzada reciente.</p></Alert>
    {form && <InstitutionForm key={form === true ? 'new' : form.hospitalId} kind="hospital" {...(form === true ? {} : { editing: form })} onSaved={read.retry} onClose={() => { setForm(null); trigger.current?.focus(); }} />}
    <ReadBoundary {...read} empty={!read.items.length}>
      <div className="sa-table-wrap"><table role="table" className="sa-table"><caption>Instituciones registradas</caption><thead><tr>{['Hospital', 'Razón social', 'Autorización', 'Creación', 'Acción'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{read.items.map((h) => <tr key={h.hospitalId}><td data-label="Hospital"><strong>{h.publicName}</strong></td><td data-label="Razón social">{h.legalName || 'No proporcionada'}</td><td data-label="Autorización"><Badge tone={h.isAuthorized ? 'success' : 'neutral'}>{h.isAuthorized ? 'Autorizado' : 'Sin autorización'}</Badge></td><td data-label="Creación">{formatLima(h.createdAt)}</td><td data-label="Acción"><Button variant="secondary" aria-label={'Editar ' + h.publicName} onClick={(event) => { trigger.current = event.currentTarget; setForm(h); }}>Editar</Button></td></tr>)}</tbody></table></div>
    </ReadBoundary>
    {!read.loading && !read.error && <MoreResults {...read} count={read.items.length} />}
  </>;
}


