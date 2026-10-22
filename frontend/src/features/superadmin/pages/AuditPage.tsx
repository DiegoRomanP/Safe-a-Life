import { useState } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { Select } from '../../../components/ui/Select.js';
import { formatDateTime } from '../../../lib/format.js';
import { auditResultLabel } from '../labels.js';
import { useSuperadminDemo } from '../SuperadminDemoContext.js';

// SA-07 Auditoría minimizada (Penpot «+»). listAuditEvents entrega eventos
// append-only con actor y recurso opacos, sin valores personales. El contrato
// solo pagina (limit, cursor): los filtros se aplican sobre los eventos
// cargados. Sin backend (D-4).
export function AuditPage() {
  const { auditEvents } = useSuperadminDemo();
  const [eventFilter, setEventFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const eventOptions = [...new Set(auditEvents.map((item) => item.event))].sort().map((value) => ({ value, label: value }));
  const visible = auditEvents.filter(
    (item) => (!eventFilter || item.event === eventFilter) && (!resultFilter || item.result === resultFilter),
  );

  return (
    <>
      <PageHeader title="Auditoría minimizada" description="Eventos append-only con identificadores opacos y sin valores personales." />
      <Alert tone="brand" title="Sin PII en auditoría">
        No se guardan nombres, correos, coordenadas, tokens ni valores anteriores o nuevos.
      </Alert>

      <section aria-label="Filtros" className="flex flex-wrap items-end gap-4">
        <Field label="Evento" className="min-w-[240px]">
          {(control) => (
            <Select
              {...control}
              options={[{ value: '', label: 'Todos los eventos' }, ...eventOptions]}
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
          )}
        </Field>
        <Field label="Resultado" className="min-w-[200px]">
          {(control) => (
            <Select
              {...control}
              options={[
                { value: '', label: 'Todos' },
                { value: 'ok', label: auditResultLabel.ok },
                { value: 'denegado', label: auditResultLabel.denegado },
                { value: 'fallido', label: auditResultLabel.fallido },
              ]}
              value={resultFilter}
              onChange={(event) => setResultFilter(event.target.value)}
            />
          )}
        </Field>
        <Button
          variant="ghost"
          onClick={() => {
            setEventFilter('');
            setResultFilter('');
          }}
        >
          Limpiar filtros
        </Button>
      </section>
      <p aria-live="polite" className="text-sm text-muted">
        {`${visible.length} ${visible.length === 1 ? 'evento' : 'eventos'}`}
      </p>

      {visible.length === 0 ? (
        <EmptyState message="No hay eventos con esos filtros" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[880px] text-left">
            <caption className="sr-only">Eventos de auditoría</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-4 py-4 font-semibold">Fecha</th>
                <th scope="col" className="px-4 py-4 font-semibold">Evento</th>
                <th scope="col" className="px-4 py-4 font-semibold">Actor opaco</th>
                <th scope="col" className="px-4 py-4 font-semibold">Recurso</th>
                <th scope="col" className="px-4 py-4 font-semibold">Resultado</th>
                <th scope="col" className="px-4 py-4 font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((item) => (
                <tr key={item.eventId} className="text-ink">
                  <th scope="row" className="px-4 py-4 font-semibold">{formatDateTime(item.occurredAt)}</th>
                  <td className="px-4 py-4 font-mono text-sm">{item.event}</td>
                  <td className="px-4 py-4">{item.actorCode}</td>
                  <td className="px-4 py-4">{item.resourceCode}</td>
                  <td className="px-4 py-4">{auditResultLabel[item.result]}</td>
                  <td className="px-4 py-4">{item.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
