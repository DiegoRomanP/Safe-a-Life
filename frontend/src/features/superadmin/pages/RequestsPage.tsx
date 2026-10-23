import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { Badge } from '../../../components/ui/Badge.js';
import { buttonClass } from '../../../components/ui/Button.js';
import { MoreResults, PageIntro, ReadBoundary, useAdminPage } from '../components/AdminStates.js';
import { adminPath, idPath, requestsPage } from '../httpGateway.js';
import { formatLima, requestFieldLabels, requestStatusLabels } from '../format.js';

export function RequestsPage() {
  const read = useAdminPage(adminPath + '/correction-requests', requestsPage);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const requests = read.items.filter((r) => (!type || r.type === type) && (!status || r.status === status) && r.requestId.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageIntro title="Solicitudes de privacidad" description="Revisa metadatos de corrección y eliminación sin navegar el padrón de donantes." />
    <div className="sa-filters"><label htmlFor="sa-request-type">Tipo<Select id="sa-request-type" value={type} onChange={(event) => setType(event.target.value)} options={[{ value: '', label: 'Todos los tipos' }, { value: 'correccion', label: 'Corrección' }, { value: 'eliminacion', label: 'Eliminación' }]} /></label><label htmlFor="sa-request-status">Estado<Select id="sa-request-status" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: '', label: 'Cualquier estado' }, ...Object.entries(requestStatusLabels).map(([value, label]) => ({ value, label }))]} /></label><label htmlFor="sa-request-id">Buscar código de solicitud<Input id="sa-request-id" type="search" maxLength={40} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    <ReadBoundary {...read} empty={!requests.length}><div className="sa-table-wrap"><table role="table" className="sa-table"><caption>Solicitudes registradas</caption><thead><tr>{['Código', 'Tipo y campos', 'Estado', 'Creación', 'Acción'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{requests.map((r) => <tr key={r.requestId}><td data-label="Código"><strong>{r.requestId}</strong></td><td data-label="Tipo y campos">{r.type === 'correccion' ? 'Corrección' : 'Eliminación'}<p className="mt-1 text-sm text-muted">{r.requestedFields.map((f) => requestFieldLabels[f]).join(', ')}</p></td><td data-label="Estado"><Badge tone={r.status === 'pendiente' ? 'warning' : 'neutral'}>{requestStatusLabels[r.status]}</Badge></td><td data-label="Creación">{formatLima(r.createdAt)}</td><td data-label="Acción"><Link className={buttonClass('secondary')} to={'/superadmin/solicitudes/' + idPath(r.requestId)} aria-label={'Revisar solicitud ' + r.requestId}>Revisar</Link></td></tr>)}</tbody></table></div></ReadBoundary>
    {!read.loading && !read.error && <MoreResults {...read} count={read.items.length} />}
  </>;
}

