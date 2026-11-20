/**
 * Recuerda un resultado `null` (p. ej. el 404 esperado de un recurso que aún no existe) para no repetir la petición;
 * cualquier otro resultado o error se vuelve a pedir en la siguiente llamada (reintentos y recargas tras un conflicto).
 */
export function rememberNull<T>(load: () => Promise<T | null>): () => Promise<T | null> {
  let missing = false;
  return async () => {
    if (missing) return null;
    const result = await load();
    missing = result === null;
    return result;
  };
}
