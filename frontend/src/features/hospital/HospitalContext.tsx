import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/demoApi.js';
import {
  createNeedRequest,
  createSignupRequest,
  fetchNeeds,
  fetchSignups,
  fetchSites,
  reissueSignupRequest,
  transitionNeedRequest,
} from './api.js';
import type { AssistedSignup, HospitalNeed, HospitalSite, NeedStatus, NewNeed } from './types.js';

type Data = { needs: HospitalNeed[]; sites: HospitalSite[]; signups: AssistedSignup[] };

// `forbidden`: el backend responde 403 a todo el área si la membresía no está activa o el hospital no está autorizado;
// no es una lista vacía (que sería un 200 válido).
type Status = 'loading' | 'ready' | 'error' | 'forbidden';

// Las acciones devuelven `null`/`false` si fallaron: el motivo queda en `actionError` y nada cambió.
type Hospital = Data & {
  status: Status;
  reload: () => void;
  actionError: string | null;
  /** La pantalla cambió: el aviso de error de la anterior se descarta, salvo el que se creó para la pantalla siguiente. */
  routeChanged: () => void;
  // createHospitalNeed siempre crea un borrador; «activar» aplica además transitionOwnHospitalNeed. Si la activación falla,
  // el borrador existe: se devuelve igual y `actionError` explica qué pasó.
  createNeed: (need: NewNeed, activate: boolean) => Promise<HospitalNeed | null>;
  transitionNeed: (needId: string, status: Extract<NeedStatus, 'activa' | 'cerrada' | 'cancelada'>) => Promise<boolean>;
  createSignup: (input: { email: string; name?: string }) => Promise<boolean>;
  reissueSignup: (signupId: string) => Promise<boolean>;
};

const HospitalContext = createContext<Hospital | null>(null);

const EMPTY: Data = { needs: [], sites: [], signups: [] };

async function loadAll(): Promise<Data> {
  const [needs, sites, signups] = await Promise.all([fetchNeeds(), fetchSites(), fetchSignups()]);
  return { needs, sites, signups };
}

function messageFor(error: unknown): string {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 409) return 'El servidor no pudo aplicar el cambio con el estado actual. Actualizamos los datos; revisa e intenta de nuevo.';
  if (status === 400 || status === 422) return 'El servidor rechazó los datos (por ejemplo, la sede ya no está disponible). Revísalos e intenta de nuevo.';
  if (status === 403) return 'Tu cuenta no tiene acceso para esta acción.';
  if (status === 404) return 'Ya no existe o no está disponible.';
  if (status === 429) return 'Demasiados intentos. Espera unos minutos.';
  return 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';
}

// Datos del área del hospital desde el backend real. El hospital y la sede los deriva siempre el servidor de la membresía:
// el cliente no los envía. Las listas se vuelven a pedir tras cada escritura (el servidor es la fuente de estados y fechas).
export function HospitalProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [status, setStatus] = useState<Status>('loading');
  const [tries, setTries] = useState(0);
  // `carry`: el aviso está pensado para la pantalla siguiente (p. ej. borrador creado pero no activado) y sobrevive un cambio de ruta.
  const [actionState, setActionState] = useState<{ message: string; carry: boolean } | null>(null);
  const actionError = actionState?.message ?? null;
  const setActionError = useCallback((message: string | null, carry = false) => setActionState(message ? { message, carry } : null), []);
  const routeChanged = useCallback(() => setActionState((current) => (current?.carry ? { ...current, carry: false } : null)), []);
  const inFlight = useRef(false);
  const live = useRef(true);
  // Cada carga lleva un número: si otra se pidió después, la respuesta vieja se descarta.
  const loadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = (loadSeq.current += 1);
    const next = await loadAll();
    if (live.current && seq === loadSeq.current) setData(next);
  }, []);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    refresh().then(
      () => { if (live.current) setStatus('ready'); },
      (error: unknown) => { if (live.current) setStatus(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error'); },
    );
  }, [tries, refresh]);

  const reload = useCallback(() => {
    setStatus('loading');
    setTries((current) => current + 1);
  }, []);

  const value = useMemo<Hospital>(() => {
    // Una escritura a la vez: dos clics seguidos no alcanzan a ver el estado pendiente.
    const act = async <T,>(run: () => Promise<T>): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setActionError(null);
      try {
        const result = await run();
        try {
          await refresh();
        } catch {
          if (live.current) setActionError('El cambio se guardó, pero no pudimos actualizar la lista. Recarga la página.');
        }
        return result;
      } catch (error) {
        if (live.current) setActionError(messageFor(error));
        // Un conflicto suele significar datos viejos: se refrescan sin ocultar el aviso.
        if (error instanceof ApiError && error.status === 409) refresh().catch(() => undefined);
        return null;
      } finally {
        inFlight.current = false;
      }
    };
    const ok = async (run: () => Promise<unknown>) => (await act(run)) !== null;

    return {
      ...data,
      status,
      reload,
      actionError,
      routeChanged,
      createNeed: (need, activate) =>
        act(async () => {
          const created = await createNeedRequest(need);
          if (!activate) return created;
          try {
            return await transitionNeedRequest(created.needId, 'activa');
          } catch (error) {
            if (live.current) setActionError(`La necesidad se creó como borrador, pero no se pudo activar. ${messageFor(error)}`, true);
            return created;
          }
        }),
      transitionNeed: (needId, next) => ok(() => transitionNeedRequest(needId, next)),
      createSignup: (input) => ok(() => createSignupRequest(input)),
      reissueSignup: (signupId) => ok(() => reissueSignupRequest(signupId)),
    };
  }, [data, status, reload, refresh, actionError, routeChanged, setActionError]);

  return <HospitalContext.Provider value={value}>{children}</HospitalContext.Provider>;
}

export function useHospital(): Hospital {
  const value = useContext(HospitalContext);
  if (!value) throw new Error('useHospital debe usarse dentro de HospitalProvider.');
  return value;
}
