import type { Card } from "../model/card.js";
import { SCORING } from "../config.js";
import { cardValue, clamp } from "./value.js";

export interface PickScore {
  score: number; // 0-100
  grade: string; // A+ .. F
  picked: Card;
  best: Card;
  pickedValue: number;
  bestValue: number;
  isBest: boolean;
  onColor: boolean;
  rankInPack: number; // 1 = best available
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

// Committed colors: colors with >=2 cards in the current pool.
export function committedColors(pool: Card[]): Set<string> {
  const counts = new Map<string, number>();
  for (const c of pool) for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= 2).map(([c]) => c));
}

// A pick worth quizzing: the pack still has enough cards that the choice is real
// (late forced picks of 2-3 cards teach nothing). Threshold is configurable.
export function isDecisionPick(pack: Card[], minCards: number): boolean {
  return pack.length >= minCards;
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

export function scorePick(pack: Card[], picked: Card, pool: Card[]): PickScore {
  const ranked = [...pack].sort((a, b) => cardValue(b) - cardValue(a));
  const best = ranked[0];
  const bestValue = cardValue(best);
  const pickedValue = cardValue(picked);
  const rankInPack = ranked.findIndex((c) => c.name === picked.name) + 1;

  const committed = committedColors(pool);
  // You can't be "off-color" before committing to any colors — early picks are
  // expendable and staying open is correct. Fixes the bogus P1P1 "off your
  // colors" warning (notes.md #1); partial credit below stays gated on committed.
  const onColor =
    committed.size === 0 ||
    picked.colors.length === 0 ||
    picked.colors.some((c) => committed.has(c));

  let score: number;
  if (picked.name === best.name) {
    score = 100;
  } else {
    const gap = bestValue - pickedValue; // in win-rate points (0-1)
    score = 100 - gap * SCORING.winRateGapK;
    if (onColor && committed.size > 0) score += SCORING.onColorPartialCredit;
  }
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    grade: gradeFor(score),
    picked,
    best,
    pickedValue,
    bestValue,
    isBest: picked.name === best.name,
    onColor,
    rankInPack,
  };
}
