import type { Card } from "../model/card.js";
import { RARITY_BASELINE, SCORING } from "../config.js";

// A single 0-1 "quality" score per card, win-rate-like. Prefers 17Lands GIH WR
// when the sample is trustworthy; otherwise blends a rarity baseline with a
// small ALSA nudge so obscure/low-data cards still order sensibly.
export function cardValue(card: Card): number {
  const games = card.gihGames ?? 0;
  if (card.gihWinRate != null && games >= SCORING.minSampleForWinRate) {
    return card.gihWinRate;
  }

  const baseline = RARITY_BASELINE[card.rarity] ?? 0.51;
  // Lower ALSA (taken earlier) => small positive nudge, capped.
  const alsaNudge = card.alsa != null ? clamp((8 - card.alsa) / 100, -0.02, 0.02) : 0;

  if (card.gihWinRate != null && games > 0) {
    // Partial data: weight toward the observed WR as sample grows.
    const w = games / SCORING.minSampleForWinRate;
    return card.gihWinRate * w + (baseline + alsaNudge) * (1 - w);
  }
  return baseline + alsaNudge;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
