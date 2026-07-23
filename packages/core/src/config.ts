// Pure domain constants. No environment access, no I/O — everything here is
// safe to import from the CLI, a Convex function, or the browser.

// Fallback pack shape, for sets we have no observed draft data for: 15 cards,
// no bonus sheet, no land slot, so a 3-pack draft is 45 picks. Sets that carry
// a `packComposition` ignore all of this and deal their real shape instead --
// modern Play Boosters are 14 cards and 42 picks. See makePack.
export const PACK = {
  rareOrMythic: 1,
  uncommon: 3,
  common: 11,
  mythicChance: 1 / 8,
  packsPerDraft: 3,
};

export const packSize = () => PACK.rareOrMythic + PACK.uncommon + PACK.common;

export const DRAFT = {
  seats: 8,
  humanSeat: 0,
};

export const SCORING = {
  // A ~2% GIH WR gap to the best card costs ~15 points.
  winRateGapK: 750,
  // Below this many "games in hand", trust rarity/ALSA more than a noisy WR.
  minSampleForWinRate: 200,
  onColorPartialCredit: 8,
};

// Rough baseline card value (0-1 scale, ~win-rate-like) when 17Lands data is
// missing, so picks still order sensibly.
export const RARITY_BASELINE: Record<string, number> = {
  mythic: 0.57,
  rare: 0.55,
  uncommon: 0.53,
  common: 0.51,
  special: 0.52,
  bonus: 0.52,
};

// Post-draft review. Only "decision" picks (packs with at least this many cards
// left) get quizzed; the rest flash by as a passive summary. A future frontend
// can expose this as a slider.
export const REVIEW = {
  decisionPickMinCards: 5,
};
