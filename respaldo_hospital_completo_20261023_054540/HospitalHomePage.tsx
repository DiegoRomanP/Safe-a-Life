import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, errorMessage } from '../../../api/client.js';

interface NeedsPage { items: unknown[]; pagination?: { nextCursor?: string | null } }

export function HospitalHomePage() {
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<NeedsPage>('/api/v1/hospitals/me/needs?limit=20', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) {
          if (!Array.isArray(data.items)) throw new Error('Respuesta de necesidades no válida');
          setItems(data.items);
          setError('');
        }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  return <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8 text-ink">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold">Hospital · Necesidades</h1>
        <p className="text-muted">Datos de tu hospital autorizado, consultados desde el servidor.</p></div>
      <div className="flex gap-3"><button className="rounded-lg border border-line px-4 py-2" onClick={() => { setLoading(true); setVersion(v => v + 1); }}>Actualizar</button>
        <Link className="rounded-lg border border-line px-4 py-2" to="/ingresar">Cambiar de cuenta</Link></div>
    </header>
    {loading ? <p role="status">Consultando necesidades…</p> : error ? <p role="alert">{error}</p> : items.length === 0 ?
      <section className="rounded-xl border border-line bg-surface p-6"><h2 className="text-xl font-semibold">Sin necesidades registradas</h2>
        <p className="text-muted">Tu hospital todavía no tiene necesidades. No se muestran datos ficticios.</p></section> :
      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-xl font-semibold">Necesidades registradas: {items.length}</h2>
        <p className="text-muted">La consulta ya utiliza PostgreSQL. La creación y el cambio de estado se conectarán en la siguiente etapa.</p>
      </section>}
  </main>;
}
