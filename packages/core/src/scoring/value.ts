import type { EngineCard, Rarity } from "../model/card.js";
import { RARITY_BASELINE, SCORING } from "../config.js";
import { isBasicLand } from "../model/card.js";

// What ingest computes `EngineCard.value` with. Spelled out rather than picked
// off Card, because no stored half carries all five: four are on the text half
// and rarity is on neither. Only ingest, holding a card before it comes apart,
// can call the functions below.
export interface ValueInputs {
  rarity: Rarity;
  // Only so a basic land can be recognised. See computeCardValue.
  typeLine: string;
  gihWinRate?: number;
  gihGames?: number;
  rarityBaseline?: number;
  alsa?: number;
}

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
export function observedRarityBaselines(cards: readonly ValueInputs[]): Map<Rarity, number> {
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
// the baseline onto the format's scale (see EngineCard.rarityBaseline), not by
// shifting the win rates -- so a gap between two cards stays in real win-rate
// points and SCORING.winRateGapK keeps its meaning.
// Resolved once at ingest and read from the card ever after. There is no second
// path: the formula's inputs are on CardText now, so an EngineCard cannot be
// scored any other way.
export function cardValue(card: EngineCard): number {
  return card.value;
}

export function computeCardValue(card: ValueInputs): number {
  // Before anything else, because a basic land is not an unrated card.
  //
  // The fallback below reads "no data" as "unknown" and fills it with the median
  // rated card of that rarity, which is a sound inference about a SPELL nobody
  // has data for. A basic is not unknown: 17Lands reports nothing about it
  // because there is nothing to report. Left to the fallback it came out at
  // 0.5845 in fdn -- the median rated common, outranking 123 of the set's 270
  // rated cards -- so the scorer called a Mountain the best card in the pack,
  // and the bots drafted them.
  if (isBasicLand(card)) return SCORING.basicLandValue;

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

// A fingerprint of what `computeCardValue` DOES, not of the source that does it.
//
// `EngineCard.value` is settled at ingest and read from the card ever after, so
// a change to the formula does not reach a stored pool until that pool is
// ingested again. Nothing would notice: scoring would quietly keep returning
// the old numbers, correctly and consistently, until someone thought to re-run
// the pipeline.
//
// Note it fingerprints (formula x inputs), not the formula alone: editing the
// list below invalidates every pool too, for values that did not change. That
// is the safe direction to be wrong in, and the list should rarely move.
//
// So the formula's own behaviour feeds the revision that gates re-ingestion
// (POOL_REVISION in convex/sets.ts). Change the formula and every set's
// sourceHash changes with it, which makes the next `pnpm ingest-sets` rebuild
// them -- rather than leaving a step to remember.
//
// Inputs are fixed and chosen to touch every branch: a trusted win rate, a thin
// sample, an unrated card, a measured baseline, and ALSA.
//
// The ALSA values matter more than they look. The nudge is
// clamp((8 - alsa) / 100, -0.02, 0.02), so 8 is its zero and anything outside
// (6, 10) is clamped flat -- an input set made only of those is blind to the
// divisor entirely, which a first draft of this list was. 7 and 9 sit inside the
// clamp on either side, and are what make the nudge observable.
const FINGERPRINT_INPUTS: ValueInputs[] = [
  { rarity: "common", typeLine: "Creature", gihWinRate: 0.55, gihGames: 5000, alsa: 8 },
  { rarity: "rare", typeLine: "Instant", gihWinRate: 0.62, gihGames: 5000, alsa: 1 },
  { rarity: "mythic", typeLine: "Creature", gihWinRate: 0.58, gihGames: 40, alsa: 9 },
  { rarity: "uncommon", typeLine: "Creature", gihGames: 0, alsa: 7 },
  { rarity: "common", typeLine: "Creature", gihGames: 0, alsa: 9, rarityBaseline: 0.6123 },
  {
    rarity: "special",
    typeLine: "Sorcery",
    gihWinRate: 0.5,
    gihGames: 199,
    alsa: 7,
    rarityBaseline: 0.61,
  },
  { rarity: "uncommon", typeLine: "Artifact", gihGames: 0, alsa: 14 },
  { rarity: "bonus", typeLine: "Enchantment", gihGames: 0 },
  // The basic-land rule, which is the whole reason typeLine is in this type.
  { rarity: "common", typeLine: "Basic Land — Plains", gihGames: 0 },
];

export const VALUE_FINGERPRINT = ((): string => {
  let h = 0x811c9dc5;
  for (const input of FINGERPRINT_INPUTS) {
    for (const ch of computeCardValue(input).toFixed(12)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(36);
})();
