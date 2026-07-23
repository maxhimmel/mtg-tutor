import type { Card, Rarity } from "../model/card.js";
import { RARITY_BASELINE, SCORING } from "../config.js";

// Enough rated cards of a rarity for its median to mean anything.
const MIN_RATED_PER_RARITY = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// What an unrated card of each rarity is probably worth, measured from the rated
// cards of the same set rather than assumed.
//
// This exists because RARITY_BASELINE is a fixed guess on a scale that no format
// actually sits on. In SOS TradDraft the observed medians are 0.595/0.598/0.623/
// 0.621 against constants of 0.51/0.53/0.55/0.57 -- off by ~7 points, and 41 of
// the 49 unrated cards are the rares and mythics where the gap is widest. Left
// alone, every unrated rare scores as though it were the worst card in the set.
//
// Medians, not means, so one absurd bomb does not drag a whole rarity up.
export function observedRarityBaselines(cards: readonly Card[]): Map<Rarity, number> {
  const rated = cards.filter(
    (c) => c.gihWinRate != null && (c.gihGames ?? 0) >= SCORING.minSampleForWinRate,
  );
  const out = new Map<Rarity, number>();
  if (rated.length === 0) return out;

  const overall = median(rated.map((c) => c.gihWinRate!));
  const byRarity = new Map<Rarity, number[]>();
  for (const c of rated) {
    if (!byRarity.has(c.rarity)) byRarity.set(c.rarity, []);
    byRarity.get(c.rarity)!.push(c.gihWinRate!);
  }

  for (const rarity of Object.keys(RARITY_BASELINE) as Rarity[]) {
    const seen = byRarity.get(rarity) ?? [];
    // A thin rarity falls back to the set's overall median, which is still on
    // the right scale -- unlike the constant, which is not.
    out.set(rarity, seen.length >= MIN_RATED_PER_RARITY ? median(seen) : overall);
  }
  return out;
}

// A single 0-1 "quality" score per card, win-rate-like. Prefers 17Lands GIH WR
// when the sample is trustworthy; otherwise blends a baseline with a small ALSA
// nudge so obscure/low-data cards still order sensibly.
//
// Win rates are used raw. Rated and unrated cards are made comparable by moving
// the baseline onto the format's scale (see Card.rarityBaseline), not by
// shifting the win rates -- so a gap between two cards stays in real win-rate
// points and SCORING.winRateGapK keeps its meaning.
export function cardValue(card: Card): number {
  const games = card.gihGames ?? 0;
  if (card.gihWinRate != null && games >= SCORING.minSampleForWinRate) {
    return card.gihWinRate;
  }

  const baseline = card.rarityBaseline ?? RARITY_BASELINE[card.rarity] ?? 0.51;
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
