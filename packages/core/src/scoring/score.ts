import type {
  Card,
  CardContext,
  ColorCode,
  ColorWinRate,
  EngineCard,
  PoolCard,
} from "../model/card.js";
import { SCORING } from "../config.js";
import { cardValue, clamp } from "./value.js";
import {
  type ScoringContext,
  type ValueTerm,
  commitment,
  contextValue,
  isOnColor,
  marginBetween,
} from "./context.js";

// Moved to `context.js` when the off-colour term needed it, and re-exported
// here so `scoring/score.js` stays the import path every existing caller and
// `situation.ts` already use. The rule itself did not change: it is still the
// one definition, which is the whole of why its own comment refuses a copy.
export { isOnColor };
import { type TiebreakReason, bandOf, deckNeeds, tiebreak } from "./tiebreak.js";

/**
 * Generic in the card, because scoring runs on both halves of one.
 *
 * The engine scores a pick from what it has -- the engine's fields, which is
 * all a value comparison needs. Anything that then WRITES that score for a
 * person, or for a prompt, needs the rules text too, and says so by asking for
 * a `PickScore<Card>`. Hydrating fills the difference.
 */
export interface PickScore<C extends EngineCard = EngineCard> {
  score: number; // 0-100
  grade: string; // A+ .. F
  picked: C;
  pickedValue: number;
  // What the picked card was worth once the deck was accounted for. Equal to
  // `pickedValue` with no context. The gap that produced the score is
  // `contextBestValue - pickedContextValue`, and quoting any other pair mixes
  // two scales.
  pickedContextValue: number;

  // The two answers to "what was the best card here", kept apart because the
  // gap between them is the thing worth teaching. There is no field called
  // `best`: a reader has to say which question it is asking.
  //
  // The data's top card, on raw power, blind to the pool.
  rawBest: C;
  rawBestValue: number;
  // The card that best served THIS deck. Equal to rawBest when no scoring
  // context was supplied, which is every caller that has no set to read one
  // from -- the engine replaying a draft, and every test that does not care.
  contextBest: C;
  contextBestValue: number;

  // Why the picked card was worth what it was, in win-rate points, largest
  // first. Empty when no context was supplied, or when nothing moved it. A
  // grade you cannot interrogate is worse than a simple one.
  terms: ValueTerm[];

  isBest: boolean; // took the card the grade was measured against
  /**
   * The gap to that card is inside one standard error of it, so the data cannot
   * say the pick was worse.
   *
   * NOT THE SAME AS `isBest`, AND DELIBERATELY NOT FOLDED INTO IT
   *
   * `isBest` means "took the card the grade was measured against" and is what
   * "Nothing scored higher" is rendered from. A pick inside the margin did NOT
   * score higher -- something else scored a fraction more, and the fraction is
   * smaller than the error bars on it. Making `isBest` true for that would put a
   * true-sounding sentence over a false statement, and would quietly change what
   * every stored row and every chart on that field already means.
   *
   * The SCORE follows this rather than `isBest`, which is the point: 19.5% of
   * graded misses on fdn and 13.0% on dsk are inside the margin, and the app was
   * docking them on the same screen whose prose says the two cards cannot be
   * told apart. Measured by `scripts/diagnose-margin.mjs`.
   *
   * False when no margin could be computed -- an unrated card has no error bars,
   * and "we cannot measure this" must not read as "these are the same".
   */
  indistinguishable: boolean;
  /**
   * Every card the data cannot separate from the one this was graded against,
   * the picked card excluded.
   *
   * WHY A SET AND NOT A CARD
   *
   * `contextBest` is an argmax over floats, so it always names exactly one card
   * -- and when the top of a pack is inside its own error bars, WHICH one is a
   * coin flip. Reporting that single name as "the closest alternative" claims a
   * precision the same panel has just denied, and it is what let the verdict
   * name one card while the challenge, which breaks that tie by the deck's
   * needs, argued with another. Two blocks, two names, one pack.
   *
   * Naming the whole band instead makes both true at once: the verdict says
   * these were the same, and the challenge says which of them your deck wanted
   * and why. There is no disagreement left to have, because the verdict has
   * stopped picking a winner it never had grounds for.
   *
   * Empty unless the pick is `indistinguishable` -- when the data CAN separate
   * the pack there is a single better card and it should be named as one.
   */
  band: C[];
  /**
   * Which of the band this deck actually wanted, and why -- the server's own
   * answer to the question the challenge screen asks.
   *
   * Undefined unless a principle decided something, which needs a band of more
   * than one and a reason that changed the answer.
   *
   * This is the field the whole parity exercise was for. The challenge picks a
   * card out of the band by the deck's needs; before `turn` and `role` reached
   * the pick path, the grade could not do that and named the float's argmax
   * instead, so the two panels named two cards off one pack. Both now run the
   * same `tiebreak` over the same `ctx.needs`, so this IS the challenger.
   */
  preferred?: C;
  /** Why `preferred` was preferred. Empty when nothing was. */
  reasons: TiebreakReason[];
  onColor: boolean;
  rankInPack: number; // 1 = best available, by raw power
}

/**
 * The margin of error on the gap between two cards, in win-rate points.
 *
 * A GIH win rate is a proportion measured over `gihGames` games, so it carries
 * a standard error of sqrt(p(1-p)/n), and the difference between two of them
 * carries the sum of their variances. At the sample sizes 17Lands publishes
 * that is around ±0.9pp between two commons -- which is LARGER than most of the
 * gaps a pick is graded on.
 *
 * This is what tells a coach the difference between "you missed" and "the data
 * cannot tell these apart". Without it the prompt named a better card and never
 * said by how much, and a 0.3pp gap on a 98/100 pick came back as "take the
 * other card instead".
 *
 * One standard error, not two: the question is whether the data can separate
 * the cards at all, not whether it can at 95% confidence, and a 2-sigma band
 * would call almost every pick in the format a tie.
 *
 * Undefined when either card is unrated. Their values then come from a rarity
 * baseline rather than a measurement, and a baseline has no sample to have
 * error bars over -- saying nothing is honest where inventing a margin is not.
 */
export function gapMargin(a: Card, b: Card): number | undefined {
  const variance = (c: Card): number | undefined => {
    const { gihWinRate: p, gihGames: n } = c;
    if (p == null || n == null || n <= 0) return undefined;
    return (p * (1 - p)) / n;
  };
  const va = variance(a);
  const vb = variance(b);
  if (va == null || vb == null) return undefined;
  return Math.sqrt(va + vb);
}

export function gradeFor(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 83) return "B+";
  if (score >= 75) return "B";
  if (score >= 65) return "C+";
  if (score >= 55) return "C";
  if (score >= 45) return "D";
  return "F";
}

// Committed colors: colors with >=2 cards in the current pool. Only reads the
// colors, so a stored pool row is as good an argument as a whole card.
export function committedColors(pool: readonly PoolCard[]): Set<ColorCode> {
  const counts = new Map<ColorCode, number>();
  for (const c of pool) for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= 2).map(([c]) => c));
}

/**
 * The context a pack is judged against, from the deck as it stands.
 *
 * One function because there are now two callers and they must not drift: the
 * mutation that scores a pick, and the browser that ranks the same pack to name
 * a challenger BEFORE the pick is made. If those two built the context
 * differently the app would argue for one card and then grade against another,
 * and nothing would report the disagreement -- the same failure mode `isOnColor`
 * is shared to avoid.
 *
 * `maindeck` is the pool minus what the player has set aside, and `picksMade` is
 * how many picks have been made before this one. Both are the caller's to
 * derive, because only the caller knows which moment it is asking about.
 */
export function packScoringContext(
  maindeck: readonly EngineCard[],
  picksMade: number,
  totalPicks: number,
  archetypes: readonly ColorWinRate[],
  contextFor: (card: EngineCard) => CardContext | undefined,
): ScoringContext {
  const colors = committedColors(maindeck);
  return {
    colors,
    commitment: commitment(maindeck, colors, picksMade, totalPicks),
    archetypes,
    contextFor,
    // From the same maindeck, at the same moment, by the one function both the
    // grade and the challenge already call. That is the whole of the fix: two
    // callers can no longer hold different needs, because neither builds them.
    needs: deckNeeds(maindeck, picksMade, totalPicks),
  };
}

// A pick worth thinking about: the pack still has enough cards that the choice
// is real (late forced picks of 2-3 cards teach nothing). Takes a count rather
// than the pack, because the coach gate runs server-side where only the size
// crosses the wire. Threshold is configurable -- REVIEW quizzes on it, COACH
// spends tokens on it.
export function isDecisionPick(cardsInPack: number, minCards: number): boolean {
  return cardsInPack >= minCards;
}

// Lenient grading for the review quiz: the guess is "right" if it matches either
// the raw-power best (data) or the AI's context-best (deck fit). The lesson lives
// in the divergence between those two, not in a single "correct" answer.
export function isCorrectGuess(
  guessName: string,
  rawBestName: string,
  contextBestName: string,
): boolean {
  return guessName === rawBestName || guessName === contextBestName;
}

/**
 * `ctx` is optional, and its absence is not a degraded mode -- it is what the
 * engine has. Replaying a draft reads the pool document and nothing else, so
 * there is no archetype table to hand over; the contextual answer then simply
 * equals the raw one. Callers that CAN read a set's context pass it and get a
 * second opinion.
 *
 * Not deal-affecting either way. Bots pick by `cardValue` directly, so nothing
 * here decides what wheels, which is what lets this keep changing.
 */
export function scorePick<C extends EngineCard>(
  pack: C[],
  picked: C,
  pool: C[],
  ctx?: ScoringContext,
): PickScore<C> {
  const ranked = [...pack].sort((a, b) => cardValue(b) - cardValue(a));
  const rawBest = ranked[0];
  const rawBestValue = cardValue(rawBest);
  const pickedValue = cardValue(picked);
  const rankInPack = ranked.findIndex((c) => c.name === picked.name) + 1;

  let contextBest = rawBest;
  let contextBestValue = rawBestValue;
  let pickedInContext = pickedValue;
  let terms: ValueTerm[] = [];
  if (ctx) {
    let bestSoFar = -Infinity;
    for (const card of pack) {
      const scored = contextValue(card, ctx);
      if (card.name === picked.name) {
        pickedInContext = scored.value;
        terms = scored.terms;
      }
      if (scored.value > bestSoFar) {
        bestSoFar = scored.value;
        contextBest = card;
      }
    }
    contextBestValue = bestSoFar;
  }

  const committed = committedColors(pool);
  const onColor = isOnColor(committed, picked.colors);

  // Graded against whichever question could actually be answered. With a
  // context that is the card that served this deck, and the gap is measured in
  // the same contextual units on both sides -- comparing a contextual best
  // against a raw picked value would charge the pick for the difference between
  // two scales.
  const target = ctx ? contextBest : rawBest;
  const targetValue = ctx ? contextBestValue : rawBestValue;
  const mine = ctx ? pickedInContext : pickedValue;

  const isBest = picked.name === target.name;
  // Whether the data can separate the pick from what it is being graded against.
  // Only with a context, because the margin comes off `CardContext.se` -- the
  // engine replaying a draft with no set to read has no error bars and must not
  // invent any.
  const margin = ctx ? marginBetween(ctx, target, picked) : undefined;
  const indistinguishable = !isBest && margin != null && targetValue - mine <= margin;

  // The other cards the data cannot separate from the target either. Measured
  // against the TARGET rather than against the picked card, because that is what
  // the band is a band around -- "cards as good as the best one here", which is
  // the set the pick turned out to belong to.
  // Assembled by the shared helper, best-first, because `tiebreak` holds the
  // incoming order on a tie -- so a band built in pack order here and in value
  // order in `challengeFor` is two different answers to one question. It was.
  const band: C[] =
    indistinguishable && ctx
      ? bandOf(
          pack
            .filter((c) => c.name !== picked.name)
            .map((c) => ({ card: c, value: contextValue(c, ctx).value })),
          (a, b) => marginBetween(ctx, a, b),
        )
      : [];

  // Which of them the deck wanted. Only when a principle actually changed the
  // answer -- a tiebreak that lands on the card the float had already chosen
  // agreed with it rather than deciding anything, and "preferred BECAUSE your
  // curve is thin" is not true of that. Same rule `challengeFor` applies, which
  // is the point: it is the same call.
  let preferred: C | undefined;
  let reasons: TiebreakReason[] = [];
  if (ctx && band.length > 1) {
    const broken = tiebreak(band, ctx.needs);
    if (broken.card.name !== target.name) {
      preferred = broken.card;
      reasons = broken.reasons;
    }
  }

  let score: number;
  if (isBest || indistinguishable) {
    // A pick the data cannot separate from the best scores as the best, because
    // any number below 100 asserts a difference the data denies -- and the
    // verdict beside it already says so in words. The two disagreeing is the
    // thing this closes; the score is the half people believe.
    score = 100;
  } else {
    const gap = targetValue - mine; // in win-rate points (0-1)
    score = 100 - gap * SCORING.winRateGapK;
    // Only without a context. `contextValue` already charges what leaving your
    // colours costs, measured per set -- adding a flat bonus on top would pay
    // twice for the same fact, and in a unit nobody derived.
    if (!ctx && onColor && committed.size > 0) score += SCORING.onColorPartialCredit;
  }
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    grade: gradeFor(score),
    picked,
    pickedValue,
    pickedContextValue: pickedInContext,
    rawBest,
    rawBestValue,
    contextBest,
    contextBestValue,
    terms,
    // Tracks whatever the grade was measured against, so a 100/100 pick can
    // never come back marked as a miss.
    isBest,
    indistinguishable,
    band,
    ...(preferred ? { preferred } : {}),
    reasons,
    onColor,
    rankInPack,
  };
}
