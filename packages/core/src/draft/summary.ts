import type { Card } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";

export interface DraftSummary {
  overallScore: number; // mean pick score, 0-100
  accuracy: number; // share of picks that took the best card, 0-1
  colorPair: string; // e.g. "WU"; "" when the pool has no colored cards
  pickCount: number;
}

// The two colours the pool leans on hardest, in WUBRG order.
export function deckColorPair(pool: Card[]): string {
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

export function summarizeDraft(history: RecordedPick[], pool: Card[]): DraftSummary {
  if (history.length === 0) {
    return { overallScore: 0, accuracy: 0, colorPair: "", pickCount: 0 };
  }

  return {
    overallScore: history.reduce((sum, h) => sum + h.score.score, 0) / history.length,
    accuracy: history.filter((h) => h.score.isBest).length / history.length,
    colorPair: deckColorPair(pool),
    pickCount: history.length,
  };
}
