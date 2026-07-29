import type { PoolCard } from "../model/card.js";
import { PACK } from "../config.js";
import { committedColors } from "../scoring/score.js";
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

// `pool` must be the pool as it stood BEFORE the pick, because `onColor` was
// judged against exactly that -- rendering the two from different moments is how
// a prompt ends up calling a pick off-color and then listing the color it made.
export function commitmentLine(pool: readonly PoolCard[], onColor: boolean): string {
  const committed = committedColors(pool);
  if (committed.size === 0) {
    return "Committed colors: none yet (no color has 2+ cards) — the pool is still open.";
  }
  const subject = committed.size === 1 ? "that color" : "those colors";
  const status = onColor ? `is on ${subject}` : `is OFF ${subject}`;
  return `Committed colors: ${colorNames([...committed])} (2+ cards in the pool). This pick ${status}.`;
}
