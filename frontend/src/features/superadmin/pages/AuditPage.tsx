import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { Alert } from '../../../components/ui/Alert.js';
import { MoreResults, PageIntro, ReadBoundary, useAdminPage } from '../components/AdminStates.js';
import { adminPath, auditPage } from '../httpGateway.js';
import { formatLima } from '../format.js';

const cleared = { event: '', result: '', date: '' };
const results = { ok: 'Éxito', denegado: 'Denegado', fallido: 'Fallido' };
export function AuditPage() {
  const read = useAdminPage(adminPath + '/audit-events', auditPage);
  const [draft, setDraft] = useState(cleared);
  const [filters, setFilters] = useState(cleared);
  const eventOptions = [...new Set(read.items.map((e) => e.event))];
  const events = read.items.filter((e) => (!filters.event || e.event === filters.event) && (!filters.result || e.result === filters.result) && (!filters.date || new Date(new Date(e.occurredAt).valueOf() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10) === filters.date));
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }); };
  return <>
    <PageIntro title="Auditoría minimizada" description="Eventos persistidos con identificadores opacos y sin valores personales." />
    <Alert tone="brand" title="Sin datos personales en auditoría"><p>Esta vista consulta códigos de evento, recurso y resultado. No muestra correos, coordenadas, tokens ni valores anteriores o nuevos.</p></Alert>
    <form onSubmit={apply} className="sa-filters"><label htmlFor="sa-audit-event">Filtrar por evento<Select id="sa-audit-event" value={draft.event} onChange={(event) => setDraft({ ...draft, event: event.target.value })} options={[{ value: '', label: 'Todos los eventos' }, ...eventOptions.map((event) => ({ value: event, label: event }))]} /></label><label htmlFor="sa-audit-result">Resultado<Select id="sa-audit-result" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} options={[{ value: '', label: 'Todos' }, ...Object.entries(results).map(([value, label]) => ({ value, label }))]} /></label><label htmlFor="sa-audit-date">Fecha · Lima, UTC−5<Input id="sa-audit-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><div className="flex flex-wrap gap-3 sm:col-span-3"><Button type="submit" variant="secondary">Aplicar filtros</Button><Button variant="ghost" onClick={() => { setDraft(cleared); setFilters(cleared); }}>Limpiar</Button></div></form>
    <ReadBoundary {...read} empty={!events.length}><div className="sa-table-wrap"><table role="table" className="sa-table"><caption>Bitácora · solo lectura</caption><thead><tr>{['Fecha', 'Evento', 'Actor opaco', 'Recurso', 'Resultado'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{events.map((e) => <tr key={e.eventId}><td data-label="Fecha">{formatLima(e.occurredAt)}</td><td data-label="Evento">{e.event}</td><td data-label="Actor opaco">{e.actorCode}</td><td data-label="Recurso">{e.resourceCode}</td><td data-label="Resultado">{results[e.result]}</td></tr>)}</tbody></table></div></ReadBoundary>
    {!read.loading && !read.error && <MoreResults {...read} count={read.items.length} />}
  </>;
}

