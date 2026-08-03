import type { Card, ColorCode, EngineCard, PoolCard } from "../model/card.js";
import { SCORING } from "../config.js";
import { cardValue, clamp } from "./value.js";
import { type ScoringContext, contextValue } from "./context.js";

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

  isBest: boolean; // took the data's top card
  onColor: boolean;
  rankInPack: number; // 1 = best available, by raw power
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

// Whether a card belongs to what the pool is building. Before any commitment
// nothing can be off-color -- early picks are expendable and staying open is
// correct -- and a colorless card fits whatever the pool becomes.
//
// Shared rather than inlined because the prompt says this out loud ("this pick
// is OFF those colors") next to the colors it computed, and the two saying
// different things is the bug that sentence is most able to hide.
export function isOnColor(committed: ReadonlySet<ColorCode>, colors: readonly ColorCode[]): boolean {
  return committed.size === 0 || colors.length === 0 || colors.some((c) => committed.has(c));
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
  if (ctx) {
    let bestSoFar = -Infinity;
    for (const card of pack) {
      const v = contextValue(card, ctx).value;
      if (v > bestSoFar) {
        bestSoFar = v;
        contextBest = card;
      }
    }
    contextBestValue = bestSoFar;
  }

  const committed = committedColors(pool);
  const onColor = isOnColor(committed, picked.colors);

  // Still graded against raw power. Widening the shape and moving the grade are
  // separate changes on purpose: this one must not alter a single score.
  let score: number;
  if (picked.name === rawBest.name) {
    score = 100;
  } else {
    const gap = rawBestValue - pickedValue; // in win-rate points (0-1)
    score = 100 - gap * SCORING.winRateGapK;
    if (onColor && committed.size > 0) score += SCORING.onColorPartialCredit;
  }
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    grade: gradeFor(score),
    picked,
    pickedValue,
    rawBest,
    rawBestValue,
    contextBest,
    contextBestValue,
    isBest: picked.name === rawBest.name,
    onColor,
    rankInPack,
  };
}
