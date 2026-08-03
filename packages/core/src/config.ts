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

// The 40-card limited deck. 23/17 is the convention, not a measurement -- the
// real per-set winning-deck curves are in the data we now own and are not read
// yet. maxNonbasicLands caps how many drafted lands displace basics: a couple of
// fixers help, a pile of taplands is how a deck stops casting its spells.
export const DECK = {
  size: 40,
  spellCount: 23,
  maxNonbasicLands: 3,
};

export const SCORING = {
  // A ~2% GIH WR gap to the best card costs ~15 points.
  winRateGapK: 750,
  // Below this many "games in hand", trust rarity/ALSA more than a noisy WR.
  minSampleForWinRate: 200,
  onColorPartialCredit: 8,

  // How much of IWD is information a card's win rate does not already carry.
  // Measured, not chosen: corr(gihWr, iwd) = 0.793 across all 17 sets, so
  // r^2 = 0.63 of it is already inside the win rate and 0.37 is not.
  iwdResidualShare: 0.37,
  // Below this maindeck rate, a card's win rate was measured on the games
  // someone chose to play it rather than on the games it was taken for. This
  // one IS a judgement -- "taken and then left out more often than not" -- and
  // the correction it drives is a shrinkage toward the format baseline rather
  // than a penalty, so being wrong about it costs confidence, not points.
  maindeckTrustFloor: 0.5,
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

// Post-draft review. Only decision picks (see isDecisionPick) get quizzed; the
// rest flash by as a passive summary. A future frontend can expose this as a
// slider.
export const REVIEW = {
  decisionPickMinCards: 5,
};

// Live AI coaching. Same threshold as review, for the same reason -- the last
// few picks of a pack are forced, and coaching them spends tokens on "you had
// no choice". Clients may raise or lower their own threshold; the server clamps
// whatever it is sent to 1..maxMinPackCards so one client cannot ask for
// coaching on picks that do not exist.
export const COACH = {
  minPackCards: REVIEW.decisionPickMinCards,
  maxMinPackCards: 15,
};
