import type { ColorCode, EngineCard, PoolCard } from "../model/card.js";
import { colorKey } from "../scoring/context.js";
import { cardValue } from "../scoring/value.js";
import type { PodPolicy } from "./bots.js";
import { botRng, type Deal } from "./deal.js";
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
  /**
   * What this drafter said for the pick, before anything was revealed.
   *
   * The one thing in a comparison that a replay could never produce and a score
   * cannot stand in for: two people took different cards, and this is why. It
   * is a real prediction rather than a rationalisation because the ceremony
   * offers no way to edit it once the challenger is on screen.
   *
   * Absent when the pick was made on the passive flow, which every reader has
   * to render honestly rather than fill in -- most rows of most drafts have
   * none.
   */
  reason?: string;
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
  /** What each side was leaning on at this point, for the braid. */
  yourLean: string;
  theirLean: string;
}

/**
 * The two colours a pool leans on hardest, in WUBRG order.
 *
 * NOT `committedColors`, which is every colour with two or more cards in the
 * pool. That rule is right for a DECK -- a built forty has two or three such
 * colours and naming all of them is how a splash gets named -- and badly wrong
 * for a forty-two-card POOL, where four and five are ordinary. The braid drew
 * its strands from it and got what that implies: every strand multicolour by
 * about pick four and multicolour for the rest of the draft, on both sides, so
 * the one dimension only that diagram carried said the same thing everywhere.
 *
 * Two, because a draft deck is a pair and a reader who plays this game reads a
 * pair as a unit. The two-card floor stays, so a single off-colour first pick is
 * not a lean; an empty answer means nobody has committed to anything yet, which
 * is the truth for the first few picks and worth drawing as itself.
 */
export function leanColors(pool: readonly PoolCard[]): string {
  const counts = new Map<string, number>();
  for (const c of pool) for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);

  const top = [...counts]
    .filter(([, n]) => n >= 2)
    // Count first, then the colour's own letter -- so a tie resolves the same
    // way every time rather than by whichever card happened to be picked first.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([c]) => c);

  return colorKey(new Set(top as ColorCode[]));
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
      yourLean: leanColors(yourPool),
      theirLean: leanColors(theirPool),
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
  deal: Deal,
  seed: number,
  choose: (pack: EngineCard[], index: number) => EngineCard | undefined,
  pod: PodPolicy,
): string[][] {
  const engine = new DraftEngine(deal, botRng(seed), pod);
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
 * SOUND BY CONSTRUCTION NOW, where it used to be sound by discipline. Both walks
 * play the SAME STORED DEAL, so a swapped pick cannot change which cards are in
 * a later booster -- only who ends up holding them. It no longer rests on bots
 * drawing exactly one number per card in hand to keep a shared stream in step;
 * see deal.ts. That rule still holds and is still worth keeping, but breaking it
 * can no longer silently turn these weights into noise.
 *
 * `pod` IS NOT OPTIONAL, and the default it used to take is why. The deal fixes
 * which cards are in every booster; the pod decides which of them the bots take,
 * and therefore what wheels back to you. Replayed under the wrong policy the
 * baseline stops being the draft that was played -- so `delay`, which claims to
 * count picks until a pack YOU SAW changed, would be measuring somebody else's
 * packs. `walk` defaulted to "legacy" while every draft since pods shipped is
 * dealt `table2`, and the baseline then broke on the first name the wrong bots
 * had taken: measured over 200 table2 drafts, `of` came back 0.2 where 36 was
 * available and `reach` was 0.0 every single time. Trap #9, with the added sting
 * that a zero here reads as "this pick changed nothing" -- the most interesting
 * answer the function can give, arrived at by not running.
 */
export function forkImpact(
  deal: Deal,
  seed: number,
  pickedNames: readonly string[],
  forkIndex: number,
  theirCardName: string,
  pod: PodPolicy,
): ForkImpact {
  const byName = (pack: EngineCard[], name: string) => pack.find((c) => c.name === name);
  const bestOf = (pack: EngineCard[]) =>
    pack.reduce((best, c) => (cardValue(c) > cardValue(best) ? c : best), pack[0]);

  // Loud rather than short. Running out of NAMES is an unfinished draft and an
  // honest place to stop; a name that is not in the pack it was taken from means
  // this replay is not the draft that was played, and every number below would
  // be about a pod that never dealt to anyone. The one caller catches it.
  const baseline = walk(
    deal,
    seed,
    (pack, i) => {
      if (i >= pickedNames.length) return undefined;
      const card = byName(pack, pickedNames[i]);
      if (!card) {
        throw new Error(
          `forkImpact: "${pickedNames[i]}" is not in the pack at pick ${i}. ` +
            `The replay has diverged from the draft -- check the pod ("${pod}") and the deal.`,
        );
      }
      return card;
    },
    pod,
  );

  const counterfactual = walk(
    deal,
    seed,
    (pack, i) => {
      if (i === forkIndex) return byName(pack, theirCardName) ?? bestOf(pack);
      // Their card is gone from your pool now, so your real later pick is usually
      // still there; when it is not, carry on the way the pod itself would.
      return byName(pack, pickedNames[i]) ?? bestOf(pack);
    },
    pod,
  );

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
