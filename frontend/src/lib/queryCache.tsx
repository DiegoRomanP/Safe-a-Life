import { createContext, useContext, useState, type ReactNode } from 'react';

// Últimas lecturas de un área, por recurso, solo en memoria. Vive en el layout
// del área: se descarta al salir de ella y nunca va a localStorage ni a
// sessionStorage. Con el cliente HTTP también habrá que vaciarla al cerrar o
// cambiar la sesión (T4).
//
// Cada entrada guarda la lectura que produjo los datos: en la demo, `load`
// cambia de identidad cuando cambian los datos, así que una entrada con otro
// `load` quedó vieja por una escritura y no se muestra.
export type QueryCacheEntry = { load: () => Promise<unknown>; data: unknown };

const QueryCacheContext = createContext<Map<string, QueryCacheEntry> | null>(null);

export function QueryCacheProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map<string, QueryCacheEntry>());
  return <QueryCacheContext.Provider value={cache}>{children}</QueryCacheContext.Provider>;
}

/** null fuera de un QueryCacheProvider: sin memoria, cada visita carga de cero. */
export function useQueryCache(): Map<string, QueryCacheEntry> | null {
  return useContext(QueryCacheContext);
}
