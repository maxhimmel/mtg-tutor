/**
 * The deck-speed drill: one card, and what kind of deck wants it.
 *
 * Notes Ideas #1 asked what TYPE of deck a card belongs in -- aggro, midrange,
 * control -- and observed that nothing in the app knows this. It is not a
 * labelling job. The honest axis is how fast the deck wants the game to go, and
 * that is measurable: `deckSpeed` on a card is how much longer or shorter its
 * games ran than the games of the colours it was played in, in turns.
 *
 * WHY THE MIDDLE ANSWER IS THE DATA'S VERDICT AND NOT A LEFTOVER
 *
 * The first shape of this gated on "is the residual separable from zero" and
 * offered three answers, which is broken on its face: the cards excluded by that
 * gate ARE the middle ones, so the middle answer could never be right. The fix
 * is to gate on PRECISION instead of on effect size. A card is asked about when
 * its estimate is sharp relative to how much cards in that set actually differ;
 * then "the data cannot separate this from its colours" is a real finding about
 * the card rather than a shortage of games, and it is the third answer.
 *
 * That is the archetype quiz's shape, arrived at from the other direction, and
 * its docblock makes the argument better than this one does: a question the data
 * cannot answer stops being a wrong question and becomes a correct one. Here it
 * is also the commonest answer -- 103 of fdn's 246 askable cards -- which agrees
 * with what the sources say about Limited, where most decks are some flavour of
 * midrange and a drafter's real error is reading an opinion into a card that has
 * none.
 *
 * THE GATE IS NOT THE ARCHETYPE QUIZ'S, AND DELIBERATELY
 *
 * That drill simulates a null distribution for the RANGE over k decks, because
 * the widest gap among many noisy numbers is wide even when nothing is there --
 * a flat two-sigma gate passed 18.7% of pure noise at four decks. This drill
 * compares ONE number against a fixed point, so the ordinary two-sided standard
 * error is the correct test and that machinery would be borrowed rigour rather
 * than the right kind.
 *
 * IT IS NOT `speed`, WHICH ALREADY EXISTED AND MEASURES SOMETHING ELSE. That
 * field is ohWr - gdWr and asks when in a game a card is best for you. The two
 * correlate at -0.28 over 252 fdn cards: the right sign, about a tenth of the
 * variance shared, and neither stands in for the other.
 */

import { DECK_SPEED } from "../config.js";

/** Which end of the axis a card sits on. */
export type DeckSpeedBucket = "fast" | "middle" | "slow";

export const DECK_SPEED_BUCKETS: readonly DeckSpeedBucket[] = ["fast", "middle", "slow"];

/**
 * What each end is called on a screen, and why these words.
 *
 * Not "aggro" / "midrange" / "control". Those name a deck's whole plan, and this
 * measures one thing about it -- when the game ends. A card in the fast bucket is
 * a card whose decks close early, which is most of what aggro means and not all
 * of it, and printing the stronger word would claim the rest. The corpus rule
 * against inventing a name for something the game already names cuts both ways:
 * it also forbids borrowing a name for something you have not measured.
 */
export const BUCKET_LABELS: Readonly<Record<DeckSpeedBucket, string>> = {
  fast: "Ends it early",
  middle: "Neither",
  slow: "Goes long",
};

export interface DeckSpeedCard {
  name: string;
  /** Turns longer (+) or shorter (-) than this card's own colours ran. */
  deckSpeed?: number;
  /** One standard error on that difference. */
  deckSpeedSe?: number;
  /** Games behind it, for a reader who wants to weigh the claim. */
  deckSpeedN?: number;
}

export interface DeckSpeedQuestion {
  name: string;
  resid: number;
  se: number;
  n: number;
  /** The answer. `middle` when the residual does not clear its own error bar. */
  answer: DeckSpeedBucket;
  /** How many error bars from zero. Under the width, the answer is `middle`. */
  sigmas: number;
}

export interface DeckSpeedOptions {
  /**
   * How many error bars a residual must clear before the card is called fast or
   * slow rather than middle.
   *
   * Two, which is the same width `gapMargin` and the rest of this codebase reach
   * for, and it is a width here rather than a false-positive rate because the
   * test is one number against a fixed point. The archetype quiz needs a rate
   * because its statistic is a range over k decks and the width that buys a rate
   * moves with k; nothing moves here.
   */
  width: number;
  /**
   * How sharp an estimate has to be before the card is asked about at all,
   * as a fraction of the set's own spread of residuals.
   *
   * DERIVED RATHER THAN CHOSEN. The middle answer claims a card is not fast and
   * not slow, so the interval behind it has to be narrow enough to exclude both.
   * At `width` error bars either side, requiring `se <= precision * sd` puts a
   * middle card's whole interval inside `2 * precision` set-spreads of zero. At
   * 0.5 that is one spread, so a card called middle is measurably unlike the
   * cards at either end rather than merely unmeasured.
   *
   * Against the set's own sd rather than a turn count, because the spread runs
   * 0.11 to 0.14 between sets and a fixed threshold would ask about a different
   * fraction of each one.
   */
  precision: number;
  /** Games a card needs before its residual is read at all. */
  minGames: number;
}


const sd = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

/**
 * Every card a set can be asked about, and what the answer is.
 *
 * Cards without a residual are dropped rather than called middle. Absent means
 * unmeasured, never average -- a set whose game data carried no turns yields
 * nothing here, and saying so is the point.
 *
 * RANKED, NOT SHUFFLED, and the two halves are ranked on different things. Among
 * the cards with an end, the clearest first: those are where a person learns
 * fastest, and a card at fifteen error bars is a card whose answer they can check
 * against their own instinct. Among the middle cards, the SHARPEST first --
 * smallest error bar, so the strongest claim that the card really is neither. A
 * middle verdict on a card with thousands of games is a finding; one on a card
 * that barely cleared the floor is a shrug, and serving the shrugs first would
 * teach that the middle answer means "who knows".
 */
export function deckSpeedQuestions(
  cards: readonly DeckSpeedCard[],
  options: DeckSpeedOptions = DECK_SPEED,
): DeckSpeedQuestion[] {
  const measured = cards.filter(
    (c): c is DeckSpeedCard & { deckSpeed: number; deckSpeedSe: number } =>
      c.deckSpeed != null &&
      c.deckSpeedSe != null &&
      c.deckSpeedSe > 0 &&
      (c.deckSpeedN ?? 0) >= options.minGames,
  );
  if (measured.length === 0) return [];

  // The set's own spread, which is what `precision` is a fraction of. Taken over
  // every measured card rather than over the askable ones, because the askable
  // ones are chosen BY this number and letting it move with them would be a
  // threshold fitted to its own output.
  const spread = sd(measured.map((c) => c.deckSpeed));
  if (spread === 0) return [];
  const sharpEnough = options.precision * spread;

  const questions: DeckSpeedQuestion[] = [];
  for (const c of measured) {
    if (c.deckSpeedSe > sharpEnough) continue;
    const sigmas = c.deckSpeed / c.deckSpeedSe;
    questions.push({
      name: c.name,
      resid: c.deckSpeed,
      se: c.deckSpeedSe,
      n: c.deckSpeedN ?? 0,
      sigmas,
      answer:
        sigmas <= -options.width ? "fast" : sigmas >= options.width ? "slow" : "middle",
    });
  }

  return questions.sort((a, b) => {
    const aMid = a.answer === "middle";
    const bMid = b.answer === "middle";
    if (aMid !== bMid) return aMid ? 1 : -1;
    return aMid ? a.se - b.se : Math.abs(b.sigmas) - Math.abs(a.sigmas);
  });
}

/**
 * A run that holds all three answers, in the proportions the set actually has.
 *
 * Not an even third each. A set whose cards are mostly middle should serve a run
 * that is mostly middle, because "most cards do not pull the game either way" is
 * the lesson, and a run rebalanced to hide it would teach the opposite. What the
 * deal does guarantee is that every answer present in the set appears, so a run
 * cannot accidentally be all one bucket and train a reflex.
 */
export function dealDeckSpeedRun(
  questions: readonly DeckSpeedQuestion[],
  limit: number,
  skip = 0,
): DeckSpeedQuestion[] {
  if (limit <= 0) return [];
  const from = Math.max(0, skip);
  const piles = DECK_SPEED_BUCKETS.map((b) =>
    questions.filter((q) => q.answer === b).slice(from),
  ).filter((p) => p.length > 0);
  if (piles.length === 0) return [];

  // One from each non-empty pile first, so no answer is missing from a run that
  // is long enough to hold it; then in proportion, taking from whichever pile
  // has served least of its share.
  const run: DeckSpeedQuestion[] = [];
  const taken = piles.map(() => 0);
  const total = piles.reduce((a, p) => a + p.length, 0);

  while (run.length < limit) {
    let best = -1;
    let bestDebt = -Infinity;
    for (let i = 0; i < piles.length; i++) {
      if (taken[i] >= piles[i].length) continue;
      // Before anything is served, every pile's debt is its share, so the first
      // pass takes one from each; after that the largest pile pulls ahead.
      const debt = piles[i].length / total - taken[i] / Math.max(1, run.length);
      if (debt > bestDebt) {
        bestDebt = debt;
        best = i;
      }
    }
    if (best === -1) break;
    run.push(piles[best][taken[best]]);
    taken[best]++;
  }

  return run;
}

/**
 * How a guess went.
 *
 * `read` and `misread` rather than right and wrong, matching the archetype
 * quiz: what is being tested is a read of what a deck is trying to do.
 */
export type DeckSpeedOutcome = "read" | "misread";

export interface DeckSpeedResult {
  outcome: DeckSpeedOutcome;
  correct: boolean;
  /**
   * Which kind of wrong, because the three are three different lessons.
   *
   * - `saw-difference` -- called a middle card fast or slow. Reading an opinion
   *   into a card that has none, which the sources say is the standing Limited
   *   error and which this drill exists to catch. THE ARCHETYPE QUIZ'S WORD,
   *   deliberately: there it is calling a coin flip a difference and here it is
   *   calling a flat card fast, which is the same error about a different
   *   quantity. Sharing the word is what lets a breakdown pool them without a
   *   mapping, the way `tookRawBest` already does.
   * - `saw-none` -- called a card with a real end middle. The opposite error. If
   *   it dominates, the middle answer is too tempting and `width` is too wide.
   * - `backwards` -- called a fast card slow, or a slow card fast. The real
   *   misread, and the rarest.
   */
  mistake: "saw-difference" | "saw-none" | "backwards" | null;
}

export function gradeDeckSpeedGuess(
  question: Pick<DeckSpeedQuestion, "answer">,
  guess: DeckSpeedBucket,
): DeckSpeedResult {
  const correct = guess === question.answer;
  return {
    outcome: correct ? "read" : "misread",
    correct,
    mistake: correct
      ? null
      : question.answer === "middle"
        ? "saw-difference"
        : guess === "middle"
          ? "saw-none"
          : "backwards",
  };
}

export interface DeckSpeedRunScore {
  answered: number;
  read: number;
  misread: number;
}

export function scoreDeckSpeedRun(
  results: readonly DeckSpeedResult[],
): DeckSpeedRunScore {
  return {
    answered: results.length,
    read: results.filter((r) => r.outcome === "read").length,
    misread: results.filter((r) => r.outcome === "misread").length,
  };
}
