export type Candidate = Readonly<{ donorId: string; isExact: boolean; distanceM: number }>;

/** Exactas primero, distancia ascendente y luego `donorId` ascendente (B.3, paso 5). */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
  if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
  return a.donorId < b.donorId ? -1 : a.donorId > b.donorId ? 1 : 0;
}

export function rankCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  return Object.freeze([...candidates].sort(compareCandidates));
}
