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

// The 40-card limited deck. 23/17 is the convention, not a measurement, and it
// stays that way because the measurement is not available -- which is worth
// writing down, because the data looks like it should have it.
//
// The 17Lands game dataset has one `deck_<card>` column per card and would
// answer this exactly. `build-set-stats.mjs` reads it and drops the answer
// twice, both times for good reasons that happen to be fatal here: basic lands
// are skipped entirely (their per-card win rate is just their deck's), and
// every other column is collapsed to presence rather than copies. So the
// artifact knows how many DISTINCT non-basic cards a winning deck ran -- 19.4
// to 22.7 across the 17 sets -- and cannot say how many of them were the same
// card twice, which is the whole of the gap between that number and 23.
//
// Recovering it means a new pass over the game CSVs and a re-ingest, not a
// derivation from anything stored. Until then this is a convention honestly
// labelled, rather than a measurement quietly invented.
//
// maxNonbasicLands caps how many drafted lands displace basics: a couple of
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

  // What a basic land is worth as a pick: nothing.
  //
  // Not a tuning knob and not a guess. Every other card's value answers "how
  // much better is a deck with this in it", and for a basic the answer is zero
  // by construction -- you are handed as many as you want when you build, so
  // taking one adds nothing you did not already have. It is the one card in a
  // pack that is strictly never an improvement.
  basicLandValue: 0,
  // Below this maindeck rate, a card's win rate was measured on the games
  // someone chose to play it rather than on every game it was taken for. A
  // judgement -- "taken and then left out more often than not" -- and the
  // correction it drives only ever moves a card DOWN toward the baseline,
  // because self-selection flatters in one direction. See trapCorrection.
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
