import type { EngineCard, PoolCard } from "../model/card.js";
import { colorKey } from "../scoring/context.js";
import { committedColors, type PickScore } from "../scoring/score.js";

export interface DraftSummary {
  overallScore: number; // mean pick score, 0-100
  accuracy: number; // share of picks that took the best card, 0-1
  /**
   * The deck's colours, e.g. "WU" or "WUB"; "" when it has no coloured cards.
   *
   * Named `colorPair` because it once was one, and it is a stored field on every
   * finished session -- renaming it is a schema migration for a label, which is
   * not a trade worth making. The value is no longer a pair.
   */
  colorPair: string;
  pickCount: number;
}

/**
 * The colours a deck is in, in WUBRG order.
 *
 * This used to be the two colours the deck leaned on hardest, full stop, which
 * meant a deck splashing seven white cards was labelled as though the white were
 * not there -- the same deck named two colours in the review's masthead and three
 * on its own deck list, because the deck list counts what it plays.
 *
 * So it is `committedColors` now, which is the app's existing answer to "what is
 * this deck in": a colour is in once the deck plays two or more of it. That rule
 * already decides what the scorer treats as on-colour and what the coach says out
 * loud, and a label that disagreed with the coach was going to be the confusing
 * one whichever way it was wrong. One card is a card you are stuck with rather
 * than a colour you are in, which is why the floor is two rather than one.
 *
 * `PoolCard` rather than a whole card, because names and colours is the entire
 * dependency -- which is what lets `draft.build` answer this from the pool a
 * stored pick carries instead of replaying the draft to rebuild one.
 */
export function deckColors(pool: readonly PoolCard[]): string {
  return colorKey(committedColors(pool));
}

/**
 * `scores` rather than the engine's history, because they can differ: a pick is
 * scored against its pack's context when the caller could read one, and a
 * replay never can. The scores the player was actually shown are the stored
 * ones, so a summary built from a replay would report a draft that did not
 * happen.
 */
export function summarizeDraft(
  scores: readonly Pick<PickScore, "score" | "isBest">[],
  pool: EngineCard[],
): DraftSummary {
  if (scores.length === 0) {
    return { overallScore: 0, accuracy: 0, colorPair: "", pickCount: 0 };
  }

  return {
    overallScore: scores.reduce((sum, s) => sum + s.score, 0) / scores.length,
    accuracy: scores.filter((s) => s.isBest).length / scores.length,
    colorPair: deckColors(pool),
    pickCount: scores.length,
  };
}
