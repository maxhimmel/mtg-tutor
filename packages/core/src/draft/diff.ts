import type { EngineCard, PoolCard, SetData } from "../model/card.js";
import { colorKey } from "../scoring/context.js";
import { committedColors } from "../scoring/score.js";
import { cardValue } from "../scoring/value.js";
import { mulberry32 } from "../util/rng.js";
import { DraftEngine } from "./engine.js";

// Comparing two people's drafts of the same seed.
//
// `diff.ts` and not `challenge.ts`, which is taken: `tutor/challenge.ts` is the
// counter-argument the commitment ceremony puts to a pick. Two files with that
// basename, one about a friend and one about a card, is a trap.
//
// WHAT THIS IS ALLOWED TO CLAIM is the whole difficulty, and it was settled by
// measurement rather than argument (notes.md Ideas #8). Two drafters on one seed
// are dealt identical BOOSTERS the whole way -- the human consumes no rng and
// every bot draws exactly its hand length, so the stream position at each
// openPack is invariant -- but the packs they SEE come apart once the wheel
// brings the first divergence back round, about eight picks later. And the picks
// still mostly agree across that drift: 43 of 45 after a divergence at P1P1. So
// a diff that has stopped comparing anything looks exactly like one that has
// not, and the only defence is to say per row whether the two packs were the
// same and to mean it.

/** One drafter's row, as the store holds it. Names only -- art joins in the client. */
export interface DiffSide {
  pickIndex: number;
  packNo: number;
  pickNo: number;
  /** The pack as offered, in pick-order-irrelevant order. */
  pack: readonly PoolCard[];
  pickedName: string;
  score: number;
  grade: string;
}

export interface DiffRow {
  pickIndex: number;
  packNo: number;
  pickNo: number;
  yours: DiffSide;
  theirs: DiffSide;
  /**
   * Whether the two of you were looking at the same pack.
   *
   * Per row, and computed from the two stored packs rather than from a
   * measured constant. `DRIFTS_AFTER = 7` was right for one seed and one pod
   * size and is an artifact of `DRAFT.seats`; worse, drift is NOT monotonic --
   * packs re-converge by coincidence -- so a contiguous window is merely
   * conservative where this is exact.
   */
  samePack: boolean;
  agree: boolean;
  /**
   * Their card was not in your pack.
   *
   * Not derivable from `agree`: a disagreement can be two people answering the
   * same question or two people answering different ones, and those are
   * different lessons. Only the first is a fork.
   */
  offShelf: boolean;
  /** The colours each pool was committed to at this point, for the braid. */
  yourColors: string;
  theirColors: string;
}

export interface Fork {
  pickIndex: number;
  packNo: number;
  pickNo: number;
  yours: string;
  theirs: string;
}

export interface DiffTally {
  rows: number;
  agreed: number;
  apart: number;
  /** Rows where the packs matched, so the disagreement means something. */
  comparable: number;
  /**
   * The last index reachable from 0 without a gap, or -1.
   *
   * Conservative on purpose and labelled as such wherever it is shown: past
   * this the packs are no longer GUARANTEED to match, not "permanently
   * separated". Individual rows past it can and do match again.
   */
  guaranteedThrough: number;
  /** The first row whose packs differed, which is the drift becoming visible. */
  firstDrift?: number;
  yourAverage: number;
  theirAverage: number;
  forks: Fork[];
  widest?: DiffRow;
}

const namesOf = (pack: readonly PoolCard[]): string[] => pack.map((c) => c.name).sort();

/** Order-insensitive, because a pack is a set of cards and not a list. */
export function samePack(a: readonly PoolCard[], b: readonly PoolCard[]): boolean {
  if (a.length !== b.length) return false;
  const x = namesOf(a);
  const y = namesOf(b);
  return x.every((name, i) => name === y[i]);
}

function pickedFrom(side: DiffSide): PoolCard | undefined {
  return side.pack.find((c) => c.name === side.pickedName);
}

/**
 * The two drafts, row by row.
 *
 * Truncates to the shorter side, because a friend who is still drafting has
 * fewer rows and half a comparison is not a comparison. Callers gate on the
 * challenge being finished; this simply does not invent rows.
 */
export function diffDrafts(
  yours: readonly DiffSide[],
  theirs: readonly DiffSide[],
): DiffRow[] {
  const n = Math.min(yours.length, theirs.length);
  const rows: DiffRow[] = [];

  // Running pools rather than a stored `poolBefore`: every picked card sits in
  // its own row's pack carrying its colours, so the colour of each strand costs
  // nothing beyond what is already being read.
  const yourPool: PoolCard[] = [];
  const theirPool: PoolCard[] = [];

  for (let i = 0; i < n; i++) {
    const y = yours[i];
    const t = theirs[i];

    const yPicked = pickedFrom(y);
    const tPicked = pickedFrom(t);
    if (yPicked) yourPool.push({ name: yPicked.name, colors: yPicked.colors });
    if (tPicked) theirPool.push({ name: tPicked.name, colors: tPicked.colors });

    const agree = y.pickedName === t.pickedName;

    rows.push({
      pickIndex: y.pickIndex,
      packNo: y.packNo,
      pickNo: y.pickNo,
      yours: y,
      theirs: t,
      samePack: samePack(y.pack, t.pack),
      agree,
      offShelf: !agree && !y.pack.some((c) => c.name === t.pickedName),
      yourColors: colorKey(committedColors(yourPool)),
      theirColors: colorKey(committedColors(theirPool)),
    });
  }

  return rows;
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

export function summarizeDiff(rows: readonly DiffRow[]): DiffTally {
  let guaranteedThrough = -1;
  let contiguous = true;
  let firstDrift: number | undefined;

  for (const row of rows) {
    if (row.samePack && contiguous) guaranteedThrough = row.pickIndex;
    else contiguous = false;
    if (!row.samePack && firstDrift === undefined) firstDrift = row.pickIndex;
  }

  // A FORK is a disagreement on the SAME pack -- two people answering one
  // question. A disagreement on different packs is not a fork and must never be
  // drawn as one: there is no choice there to compare theirs against.
  const forks = rows
    .filter((r) => r.samePack && !r.agree)
    .map((r) => ({
      pickIndex: r.pickIndex,
      packNo: r.packNo,
      pickNo: r.pickNo,
      yours: r.yours.pickedName,
      theirs: r.theirs.pickedName,
    }));

  const disagreements = rows.filter((r) => !r.agree);
  const widest = disagreements.reduce<DiffRow | undefined>((best, r) => {
    const gap = Math.abs(r.theirs.score - r.yours.score);
    if (!best) return r;
    return gap > Math.abs(best.theirs.score - best.yours.score) ? r : best;
  }, undefined);

  return {
    rows: rows.length,
    agreed: rows.filter((r) => r.agree).length,
    apart: disagreements.length,
    comparable: rows.filter((r) => r.samePack).length,
    guaranteedThrough,
    firstDrift,
    yourAverage: mean(rows.map((r) => r.yours.score)),
    theirAverage: mean(rows.map((r) => r.theirs.score)),
    forks,
    widest,
  };
}

export interface ForkImpact {
  pickIndex: number;
  /**
   * Picks until this choice first changed a pack you saw, or undefined if it
   * never did.
   *
   * Policy-free and exact. Your own pick cannot reach your own packs until the
   * wheel brings it round, so every one of your actual later picks is still
   * available up to that point and the counterfactual cannot diverge before it.
   */
  delay?: number;
  /**
   * How many of your remaining packs would have looked different.
   *
   * NOT policy-free, and must be labelled where it is shown. Past the wheel your
   * real next pick may not exist in the counterfactual pack, so this assumes you
   * would have gone on drafting the same way -- taking your actual card when it
   * is there, and the pod's own best when it is not.
   */
  reach: number;
  /** How many packs the measurement covered, so `reach` has a denominator. */
  of: number;
}

function walk(
  set: SetData,
  seed: number,
  choose: (pack: EngineCard[], index: number) => EngineCard | undefined,
): string[][] {
  const engine = new DraftEngine(set, mulberry32(seed));
  const packs: string[][] = [];

  for (let i = 0; !engine.isComplete(); i++) {
    const pack = engine.currentPack;
    if (pack.length === 0) break;

    packs.push(namesOf(pack));

    const card = choose(pack, i);
    if (!card) break;
    engine.humanPick(card);
  }

  return packs;
}

const sameNames = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * How much one pick actually mattered, by running the pod again without it.
 *
 * A controlled experiment rather than a correlation, and it is sound because the
 * engine is deterministic in a specific way: hand length at a given pick is the
 * same for every seat regardless of who took what, every bot draws exactly one
 * number per card in its hand, and the human draws none. So the rng stream
 * position is invariant and swapping one pick changes WHICH cards are where and
 * nothing else. A finished draft replays in ~0.16ms, so a handful of forks costs
 * well under a millisecond.
 *
 * This is the cheapest single-ply form of the alternate-draft-lines idea the
 * seed was stored to keep possible.
 *
 * Throws nothing it can help: a set whose pool has moved makes the BASELINE
 * replay diverge, and the caller is expected to let the braid go without weights
 * rather than take the screen down.
 */
export function forkImpact(
  set: SetData,
  seed: number,
  pickedNames: readonly string[],
  forkIndex: number,
  theirCardName: string,
): ForkImpact {
  const byName = (pack: EngineCard[], name: string) => pack.find((c) => c.name === name);
  const bestOf = (pack: EngineCard[]) =>
    pack.reduce((best, c) => (cardValue(c) > cardValue(best) ? c : best), pack[0]);

  const baseline = walk(set, seed, (pack, i) => byName(pack, pickedNames[i]));

  const counterfactual = walk(set, seed, (pack, i) => {
    if (i === forkIndex) return byName(pack, theirCardName) ?? bestOf(pack);
    // Their card is gone from your pool now, so your real later pick is usually
    // still there; when it is not, carry on the way the pod itself would.
    return byName(pack, pickedNames[i]) ?? bestOf(pack);
  });

  const upTo = Math.min(baseline.length, counterfactual.length);
  let delay: number | undefined;
  let reach = 0;

  for (let i = forkIndex + 1; i < upTo; i++) {
    if (sameNames(baseline[i], counterfactual[i])) continue;
    if (delay === undefined) delay = i - forkIndex;
    reach++;
  }

  return { pickIndex: forkIndex, delay, reach, of: Math.max(0, upTo - forkIndex - 1) };
}
