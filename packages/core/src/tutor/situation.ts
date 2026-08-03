import type { ColorCode, PoolCard } from "../model/card.js";
import type { Bench } from "../model/bench.js";
import { splitPool } from "../model/bench.js";
import { PACK } from "../config.js";
import { committedColors, isOnColor } from "../scoring/score.js";
import { colorNames } from "./cardLine.js";

// Where a pick sits in the draft, and what the pool is committed to by then.
// "Pack 2, Pick 5" alone left the model unable to tell an early speculative pick
// from a late one, or an open pool from a two-color deck -- so it coached most
// picks as if they were P1P1 with everything still on the table.

// Every pack loses exactly one card per pick round, so the size it was opened at
// is recoverable from the pack in front of the player. Deriving it beats
// threading each set's pack shape (14 for Play Boosters, 15 for the older fixed
// shape) through every prompt caller.
export function situationLine(packNo: number, pickNo: number, cardsInPack: number): string {
  const packSize = cardsInPack + pickNo - 1;
  const overall = (packNo - 1) * packSize + pickNo;
  const total = PACK.packsPerDraft * packSize;
  const left = total - overall;
  return (
    `Situation: Pack ${packNo}, Pick ${pickNo} — pick ${overall} of ${total} in the draft, ` +
    (left === 0 ? "the last one." : `${left} to come.`)
  );
}

// `pool` must be the pool as it stood BEFORE the pick -- rendering the two from
// different moments is how a prompt ends up calling a pick off-color and then
// listing the color it made.
//
// On/off color is derived here rather than taken from the stored score, because
// the pool this renders is not always the pool the score was computed against:
// benching a card removes it from the commitments without rewriting history.
export function commitmentLine(pool: readonly PoolCard[], picked: PoolCard): string {
  const committed = committedColors(pool);
  const onColor = isOnColor(committed, picked.colors);
  if (committed.size === 0) {
    return "Committed colors: none yet (no color has 2+ cards) — the pool is still open.";
  }
  const subject = committed.size === 1 ? "that color" : "those colors";
  const status = onColor ? `is on ${subject}` : `is OFF ${subject}`;
  return `Committed colors: ${colorNames([...committed])} (2+ cards in the pool). This pick ${status}.`;
}

export interface Pivot {
  atPick: number;
  colors: ColorCode[];
  cards: PoolCard[];
}

// Setting a card aside and changing direction are different acts, and flattening
// them into one filtered pool loses the second. A late-pack card nobody wants is
// one bench; leaving a color is several at the same moment.
//
// The threshold is not a new number: `committedColors` already decides what a
// pool is committed to, so asking it about the cards benched at one moment gives
// exactly the colors that WOULD still count, and the ones the maindeck no longer
// holds are the ones that were left behind.
export function pivots(
  poolBefore: readonly PoolCard[],
  bench: readonly Bench[],
  pickIndex: number,
): Pivot[] {
  const stillIn = committedColors(splitPool(poolBefore, bench, pickIndex).maindeck);

  const byMoment = new Map<number, PoolCard[]>();
  for (const b of bench) {
    const card = b.atPick <= pickIndex ? poolBefore[b.pos] : undefined;
    if (card) byMoment.set(b.atPick, [...(byMoment.get(b.atPick) ?? []), card]);
  }

  return [...byMoment]
    .sort(([a], [b]) => a - b)
    .map(([atPick, cards]) => ({
      atPick,
      colors: [...committedColors(cards)].filter((c) => !stillIn.has(c)),
      cards,
    }))
    .filter((p) => p.colors.length > 0);
}

// Stated as an event with a moment, because a filtered pool can say "they are
// RW" but cannot say "they gave up on blue at pick 20" -- and the second is the
// thing worth having an opinion about.
export function pivotLines(found: readonly Pivot[]): string | null {
  if (found.length === 0) return null;
  return found
    .map(
      (p) =>
        `Pivot: at pick ${p.atPick + 1} they set aside ${p.cards.length} ` +
        `card${p.cards.length === 1 ? "" : "s"} and left ${colorNames(p.colors)} behind ` +
        `(${p.cards.map((c) => c.name).join(", ")}).`,
    )
    .join("\n");
}
