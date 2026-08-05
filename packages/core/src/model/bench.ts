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

/**
 * Set a position aside, or take it back.
 *
 * Idempotent in both directions rather than a toggle: every caller already knows
 * which state it is asking for, and a toggle flips twice on a double-click and
 * lands back where it started.
 *
 * Re-benching something already benched keeps its original clock. `atPick` is
 * what makes a pick's context stable, so a repeated call must not walk it
 * forward and quietly turn a pick-5 decision into a pick-30 one -- which is a
 * rule the clients optimistically predicting this answer have to obey too, or
 * their copy disagrees with the stored one until the next read.
 */
export function applyBench(
  bench: readonly Bench[],
  pos: number,
  benched: boolean,
  atPick: number,
): Bench[] {
  const without = bench.filter((b) => b.pos !== pos);
  if (!benched) return without;
  return [...without, bench.find((b) => b.pos === pos) ?? { pos, atPick }].sort(
    (a, b) => a.pos - b.pos,
  );
}

// Which positions moved between two readings of the same bench, as the calls
// that would get you from one to the other. A client that edits the split in
// front of the player and writes it out afterwards then sends one mutation per
// card actually moved, rather than one per card in the pool.
export function benchChanges(
  before: readonly Bench[],
  after: readonly Bench[],
): { pos: number; benched: boolean }[] {
  const was = new Set(before.map((b) => b.pos));
  const now = new Set(after.map((b) => b.pos));
  return [...new Set([...was, ...now])]
    .filter((pos) => was.has(pos) !== now.has(pos))
    .sort((a, b) => a - b)
    .map((pos) => ({ pos, benched: now.has(pos) }));
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
