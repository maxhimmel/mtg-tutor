export const HTTP = {
  userAgent:
    "mtg-tutor/0.1 (draft-trainer; https://github.com/local/mtg-tutor) contact:local",
  scryfallDelayMs: 90,
};

// Draftable cards per pack (basic-land slot is replaced by an extra common so a
// 3-pack draft yields the canonical 45 picks). Tunable per set later.
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

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Claude-powered pick coaching. `enabled` gates the feature so a draft still
// runs (with deterministic feedback) when no API key is present. The SDK reads
// ANTHROPIC_API_KEY from the environment on its own.
export const ANTHROPIC = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  maxTokens: 400, // short, snappy per-pick coaching
  effort: "low" as const, // output_config.effort — fast per pick; tunable
  enabled: !!process.env.ANTHROPIC_API_KEY,
};
