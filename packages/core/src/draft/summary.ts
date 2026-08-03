import type { EngineCard } from "../model/card.js";
import type { PickScore } from "../scoring/score.js";

export interface DraftSummary {
  overallScore: number; // mean pick score, 0-100
  accuracy: number; // share of picks that took the best card, 0-1
  colorPair: string; // e.g. "WU"; "" when the pool has no colored cards
  pickCount: number;
}

// The two colours the pool leans on hardest, in WUBRG order.
export function deckColorPair(pool: EngineCard[]): string {
  const counts = new Map<string, number>();
  for (const c of pool) {
    for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);
  }

  const order = "WUBRG";
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .join("");
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
    colorPair: deckColorPair(pool),
    pickCount: scores.length,
  };
}
