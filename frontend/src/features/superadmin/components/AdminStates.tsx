import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { verifyStepUp } from '../../../api/auth.js';
import { Input } from '../../../components/ui/Input.js';
import { apiRequest, ApiError, createMutationIntent, errorMessage } from '../../../api/client.js';
import { Button, buttonClass } from '../../../components/ui/Button.js';
import { StatePanel } from '../../../components/states/StatePanel.js';
import type { Page } from '../types.js';
import { assertMutationResult } from '../httpGateway.js';

export function useAdminRead<T>(path: string | null, parse: (value: unknown) => T) {
  const [result, setResult] = useState<{ key: object; data: T | null; error: unknown; loading: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = useMemo(() => ({ path, revision }), [path, revision]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void apiRequest<unknown>(path, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setResult({ key, data: parse(value), error: null, loading: false });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, data: null, error, loading: false });
    });
    return () => controller.abort();
  }, [path, parse, key]);
  const current = result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error, loading: !!path && (!current || current.loading), retry: useCallback(() => setRevision((n) => n + 1), []) };
}
export function useAdminPage<T>(path: string | null, parse: (value: unknown) => Page<T>) {
  const read = useAdminRead(path ? path + '?limit=20' : null, parse);
  const [extra, setExtra] = useState<{ base: Page<T>; items: T[]; cursor: string | null } | null>(null);
  const [pageError, setPageError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);
  const base = read.data;
  const current = extra?.base === base ? extra : null;
  const items = [...(base?.items ?? []), ...(current?.items ?? [])];
  const cursor = current ? current.cursor : base?.pagination.nextCursor ?? null;
  const loadMore = async () => {
    if (!path || !base || !cursor || busy.current) return;
    busy.current = true; setLoadingMore(true); setPageError(null);
    try {
      const next = parse(await apiRequest<unknown>(path + '?limit=20&cursor=' + encodeURIComponent(cursor)));
      if (next.pagination.nextCursor === cursor) throw new Error('Cursor repetido.');
      setExtra({ base, items: [...(current?.items ?? []), ...next.items], cursor: next.pagination.nextCursor });
    } catch (error) { setPageError(error); }
    finally { busy.current = false; setLoadingMore(false); }
  };
  return { ...read, items, cursor, loadMore, loadingMore, pageError };
}
export type MutationState = { pending: boolean; saved: boolean; error: unknown };
export function useAdminAction() {
  const [state, setState] = useState<MutationState>({ pending: false, saved: false, error: null });
  const pending = useRef(false);
  const intent = useRef(createMutationIntent());
  const execute = async (path: string, method: 'POST' | 'PATCH', body: unknown, afterSave?: () => void) => {
    if (pending.current) return false;
    pending.current = true; setState({ pending: true, saved: false, error: null });
    try {
      const response = await apiRequest<unknown>(path, { method, body, idempotencyKey: intent.current.keyFor(path, body) });
      try { assertMutationResult(path, response); } catch { throw new ApiError(502, 'INVALID_RESPONSE'); }
      intent.current.reset();
      setState({ pending: false, saved: true, error: null });
      afterSave?.();
      return true;
    } catch (error) {
      setState({ pending: false, saved: false, error });
      return false;
    } finally { pending.current = false; }
  };
  return { ...state, execute };
}
export function ErrorNotice({ error }: { error: unknown }) {
  const codeId = useId();
  const [codeInput, setCodeInput] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifiedFor, setVerifiedFor] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const intent = useRef(createMutationIntent());
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  const verify = async () => {
    if (busy.current) return;
    if (!/^[0-9]{6,8}$/.test(codeInput)) { setVerificationError('Ingresa el código de tu aplicación autenticadora.'); return; }
    busy.current = true; setPending(true); setVerificationError('');
    const value = codeInput; setCodeInput('');
    try { await verifyStepUp(value, intent.current.keyFor('/api/v1/auth/step-up-verifications', { code: value })); setVerifiedFor(error); intent.current.reset(); }
    catch (failure) { setVerificationError(errorMessage(failure)); }
    finally { busy.current = false; setPending(false); }
  };
  if (verifiedFor === error) return <p role="status" className="rounded-xl bg-soft-blue p-4">Identidad verificada. El borrador se conserva; vuelve a guardar para aplicar la operación.</p>;
  return <>
    <StatePanel tone="warning" symbol="!" role="alert" title={code === 'STATE_CONFLICT' ? 'Conflicto de actualización' : code === 'ACCESS_DENIED' ? 'Permiso insuficiente' : 'No se pudo completar la solicitud'} message={errorMessage(error)} action={code === 'AUTHENTICATION_REQUIRED' || code === 'MFA_REQUIRED' ? <Link className={buttonClass('secondary')} to="/ingresar">Iniciar sesión</Link> : undefined} />
    {code === 'STEP_UP_REQUIRED' && <div className="grid gap-3 rounded-xl border border-line p-4"><label htmlFor={codeId} className="text-sm font-semibold">Código de autenticación reforzada<Input id={codeId} aria-label="Código de autenticación reforzada" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={codeInput} onChange={(event) => setCodeInput(event.target.value)} disabled={pending} /></label><Button type="button" disabled={pending} onClick={() => { void verify(); }}>{pending ? 'Verificando…' : 'Verificar identidad'}</Button>{verificationError && <p role="alert">{verificationError}</p>}</div>}
  </>;
}
export function ReadBoundary({ loading, error, retry, children, empty = false }: { loading: boolean; error?: unknown; retry: () => void; children: ReactNode; empty?: boolean }) {
  if (loading) return <div role="status" aria-busy="true" className="sa-loading rounded-xl border border-line bg-surface p-6"><p>Cargando datos…</p><div /><div /><div /></div>;
  if (error) return <><ErrorNotice error={error} /><Button variant="secondary" onClick={retry}>Reintentar carga</Button></>;
  if (empty) return <StatePanel tone="neutral" symbol="—" role="status" title="Sin resultados" message="No hay registros para esta consulta." />;
  return children;
}
export function ActionNotice({ pending, saved, error }: MutationState) {
  return <><div aria-live="polite">{pending && <p role="status">Guardando…</p>}{saved && <p role="status" className="rounded-xl bg-soft-blue p-4">El servidor aceptó la operación. Actualiza la lista para consultar el estado vigente.</p>}</div>{error instanceof ApiError && (error.status === 0 || error.code === 'INVALID_RESPONSE') && <p role="status" className="text-sm text-muted">No se pudo confirmar el resultado. El servidor podría haber guardado la operación; al reintentar sin cambiar el formulario se reutiliza la misma clave.</p>}<ErrorNotice error={error} /></>;
}
export function MoreResults({ cursor, loadMore, loadingMore, pageError, count }: { cursor: string | null; loadMore: () => Promise<void>; loadingMore: boolean; pageError: unknown; count: number }) {
  return <div className="flex flex-col items-start gap-3"><p role="status" className="text-sm text-muted">{count} registros cargados.{cursor ? ' Hay más resultados.' : ''} Los filtros se aplican a los registros cargados.</p><ErrorNotice error={pageError} />{cursor && <Button variant="secondary" disabled={loadingMore} onClick={() => { void loadMore(); }}>{loadingMore ? 'Cargando…' : 'Cargar más'}</Button>}</div>;
}
export function PageIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 tabIndex={-1} className="text-3xl font-bold text-ink focus:outline-none">{title}</h1><p className="mt-2 text-muted">{description}</p></div>{action}</header>;
}





