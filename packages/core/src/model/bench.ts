// What the player has set aside, and when they decided it.
//
// A bench is a position in the pool plus the pick it happened at. The position
// is what identifies the card -- drafting two copies is normal and benching one
// must not bench both -- and `atPick` is what makes a pick's context stable:
// deciding at pick 40 that something is unplayable is not evidence about the
// deck you were building at pick 5.
//
// `atPick === pos` means the card was set aside as it was picked, which is the
// strongest statement available: you never intended to play it.
export interface Bench {
  pos: number;
  atPick: number;
}

// Benches were positions alone before they carried a clock. A legacy entry
// applied to every pick that could see it, so `atPick = pos` is the reading that
// changes nothing: sidelined from the moment it was drafted.
export function normalizeBench(stored: readonly number[] | readonly Bench[]): Bench[] {
  return stored.map((b) => (typeof b === "number" ? { pos: b, atPick: b } : b));
}

export function benchedAsOf(bench: readonly Bench[], pickIndex: number): Set<number> {
  return new Set(bench.filter((b) => b.atPick <= pickIndex).map((b) => b.pos));
}

// `poolBefore` for pick n holds positions 0..n-1, so a bench past the end simply
// has nothing to match and needs no special case.
export function splitPool<T>(
  poolBefore: readonly T[],
  bench: readonly Bench[],
  pickIndex: number,
): { maindeck: T[]; sideboard: T[] } {
  const benched = benchedAsOf(bench, pickIndex);
  return {
    maindeck: poolBefore.filter((_, i) => !benched.has(i)),
    sideboard: poolBefore.filter((_, i) => benched.has(i)),
  };
}
