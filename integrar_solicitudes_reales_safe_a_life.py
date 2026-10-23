from pathlib import Path
from datetime import datetime
import shutil

root = Path.cwd()
target = root / 'frontend/src/features/donor/pages/RequestsPage.tsx'
if not target.exists():
    raise SystemExit('No encuentro RequestsPage.tsx. Ejecuta el script desde la raíz de Safe-a-Life-login.')

source = r'''import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, createMutationIntent, errorMessage } from '../../../api/client.js';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/states/EmptyState.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Button } from '../../../components/ui/Button.js';
import { formatDate, formatDateTime } from '../../../lib/format.js';
import { requestCode, requestStatusLabel, requestTypeLabel } from '../labels.js';
import type { CorrectionRequest } from '../types.js';

type Page = { items: CorrectionRequest[]; pagination: { nextCursor: string | null } };
type ChangeKind = 'name' | 'newEmail' | 'declaredBloodType';
const bloodTypes = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'] as const;

export function RequestsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<ChangeKind>('name');
  const [value, setValue] = useState('');
  const intent = useRef(createMutationIntent());

  const load = useCallback(async (next: string | null = null, signal?: AbortSignal) => {
    const path = '/api/v1/donors/me/correction-requests?limit=20' +
      (next ? `&cursor=${encodeURIComponent(next)}` : '');
    const result = await apiRequest<Page>(path, { signal });
    if (!Array.isArray(result.items) || !result.pagination ||
        !(result.pagination.nextCursor === null || typeof result.pagination.nextCursor === 'string')) {
      throw new Error('El servidor devolvió una lista de solicitudes no válida.');
    }
    return result;
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const result = await load(null, signal);
      if (signal?.aborted) return;
      setRequests(result.items);
      setCursor(result.pagination.nextCursor);
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    setError('');
    try {
      const result = await load(cursor);
      setRequests((previous) => {
        const ids = new Set(previous.map((item) => item.requestId));
        return [...previous, ...result.items.filter((item) => !ids.has(item.requestId))];
      });
      setCursor(result.pagination.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMoreBusy(false);
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const proposed = value.trim();
    if (!proposed) { setError('Ingresa el dato que deseas corregir.'); return; }
    const changes = kind === 'name' ? { name: proposed }
      : kind === 'newEmail' ? { newEmail: proposed }
      : { declaredBloodType: proposed };
    const path = '/api/v1/donors/me/correction-requests';
    const body = { type: 'correccion', changes };
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(path, {
        method: 'POST', body, idempotencyKey: intent.current.keyFor(path, body),
      });
      intent.current.reset();
      setValue('');
      setShowForm(false);
      await refresh();
      setSuccess('Solicitud registrada en el servidor.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mis solicitudes"
        description="Consulta y registra solicitudes de corrección guardadas en el servidor."
        actions={<Button onClick={() => { setShowForm((current) => !current); setError(''); }}>
          {showForm ? 'Cerrar formulario' : 'Solicitar corrección'}
        </Button>}
      />
      {error && <Alert tone="warning" title="No se pudo completar la operación">{error}</Alert>}
      {success && <Alert tone="info" title="Solicitud enviada">{success}</Alert>}
      {showForm && (
        <form onSubmit={(event) => { void createRequest(event); }} className="mb-6 flex max-w-xl flex-col gap-4 rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold text-ink">Solicitar una corrección</h2>
          <label className="flex flex-col gap-2 text-ink">
            Dato por corregir
            <select className="min-h-12 rounded-lg border border-line bg-surface px-3 text-ink" value={kind}
              onChange={(event) => { setKind(event.target.value as ChangeKind); setValue(''); }}>
              <option value="name">Nombre</option>
              <option value="newEmail">Correo electrónico</option>
              <option value="declaredBloodType">Grupo sanguíneo declarado</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-ink">
            {kind === 'name' ? 'Nombre solicitado' : kind === 'newEmail' ? 'Nuevo correo' : 'Grupo solicitado'}
            {kind === 'declaredBloodType' ? (
              <select className="min-h-12 rounded-lg border border-line bg-surface px-3 text-ink" value={value}
                onChange={(event) => setValue(event.target.value)} required>
                <option value="">Selecciona un grupo</option>
                {bloodTypes.map((blood) => <option value={blood} key={blood}>{blood.replace('_POS', '+').replace('_NEG', '-')}</option>)}
              </select>
            ) : (
              <input className="min-h-12 rounded-lg border border-line bg-surface px-3 text-ink"
                type={kind === 'newEmail' ? 'email' : 'text'} value={value} maxLength={kind === 'name' ? 120 : 254}
                onChange={(event) => setValue(event.target.value)} required />
            )}
          </label>
          <p className="text-sm text-muted">La solicitud requiere revisión; no modifica directamente los datos protegidos.</p>
          <div><Button type="submit" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</Button></div>
        </form>
      )}
      {loading ? <p role="status" className="text-muted">Cargando solicitudes reales…</p>
      : requests.length === 0 ? (
        <EmptyState message="No tienes solicitudes" detail="Cuando registres una solicitud, aparecerá aquí." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <caption className="sr-only">Solicitudes de corrección o eliminación</caption>
            <thead><tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="px-4 py-4 font-semibold">Solicitud</th>
              <th scope="col" className="px-4 py-4 font-semibold">Tipo</th>
              <th scope="col" className="px-4 py-4 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-4 font-semibold">Creada</th>
              <th scope="col" className="px-4 py-4 font-semibold">Última actualización</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {requests.map((request) => <tr key={request.requestId} className="text-ink">
                <th scope="row" className="px-4 py-4 font-semibold">{requestCode(request.requestId)}</th>
                <td className="px-4 py-4">{requestTypeLabel(request)}</td>
                <td className="px-4 py-4">{requestStatusLabel[request.status]}</td>
                <td className="px-4 py-4">{formatDate(request.createdAt)}</td>
                <td className="px-4 py-4">{formatDateTime(request.updatedAt)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {cursor && <div className="mt-4"><Button disabled={moreBusy} onClick={() => { void loadMore(); }}>
        {moreBusy ? 'Cargando…' : 'Cargar más solicitudes'}
      </Button></div>}
      <Alert tone="info" title="Seguimiento transparente">
        Las solicitudes completadas, rechazadas o fallidas son terminales. Un nuevo cambio requiere una nueva solicitud.
      </Alert>
    </>
  );
}
'''

backup_dir=root / ('respaldo_solicitudes_reales_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup_dir.mkdir(exist_ok=False)
shutil.copy2(target,backup_dir / target.name)
target.write_text(source,encoding='utf-8')
print('Pantalla Mis solicitudes conectada a GET/POST reales.')
print('Respaldo:',backup_dir)
print('Ejecuta: npm run typecheck --workspace @save-a-life/frontend')
