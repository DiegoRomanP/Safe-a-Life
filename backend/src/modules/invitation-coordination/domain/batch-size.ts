/** Tamaño del lote manual: `min(50, max(5, 2×meta))`. */
export function batchSize(targetConfirmations: number): number {
  return Math.min(50, Math.max(5, 2 * targetConfirmations));
}
