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
//
// SIX, RAISED FROM FIVE ON 2026-08-19, and the one card matters more than it
// looks. The test is `cardsInPack >= this`, so five kept the pick that sees five
// cards -- the tenth of fourteen -- and dropped only the last four of a pack.
// Six drops the last five, which is what a player asked for after being dealt
// one of those in the misses drill: at that depth you are taking what is left,
// and a land taken to signal disinterest is not a mistake to be shown back to
// you as one.
//
// Not measured, and it did not need to be. `stats_viewed.forced` was added to
// settle exactly this and one real drill run settled it first, which is the
// better evidence -- the metric answers "how many does the floor withhold" and
// the complaint answers "was the floor in the right place", and only the second
// one is the question.
export const REVIEW = {
  decisionPickMinCards: 6,
};

// Live AI coaching. Same threshold as review, for the same reason -- the last
// few picks of a pack are forced, and coaching them spends tokens on "you had
// no choice". Clients may raise or lower their own threshold; the server clamps
// whatever it is sent to 1..maxMinPackCards so one client cannot ask for
// coaching on picks that do not exist.
//
// It moved to six with review's, which is a saving rather than a loss: one
// fewer coached pick per pack, three per draft out of about thirty, on the
// picks whose advice was always going to be "you had no choice". Following
// review rather than being pinned is the point of the reference -- the reason
// the two thresholds exist is identical, so they are wrong together or right
// together and a second number would only let them drift.
export const COACH = {
  minPackCards: REVIEW.decisionPickMinCards,
  maxMinPackCards: 15,
};

// A drill: one short, repeated question, minutes rather than the half hour a
// draft asks for. See drills/drill.ts for what the category owns.
/**
 * The archetype quiz's gates.
 *
 * Its own block rather than keys on DRILLS below, because DRILLS is shaped by
 * the misses drill -- `runLength` is 10 because that is what a digest keeps of
 * its own worst picks, which says nothing about how long a quiz should be.
 */
export const ARCHETYPE_QUIZ = {
  // A run, and the number is decided by the banks rather than by taste. Half of
  // it must be cards with an answer, so a set needs four of those -- 23 of the
  // 25 sets with archetype data clear it, and the two that do not (ecl, tdm)
  // are served short rather than refused. Eight is also about right for a
  // question that is one card and three words: a couple of minutes.
  runLength: 8,
  // How many decks must have a measured opinion about a card before it can be
  // asked about. Three of the four pairs in its colour, or three of the ten
  // decks once wedges count -- enough that the reveal's table has something to
  // say beyond the two decks the question names.
  minDecks: 3,
  // How often a card whose decks all want it equally may be asked about anyway.
  //
  // A RATE RATHER THAN A WIDTH, and the difference is not pedantry. Best minus
  // worst is a range over up to ten decks, and the widest gap among ten noisy
  // numbers is wide even when nothing is there -- a flat two-sigma gate passes
  // 18.7% of pure noise at four decks and 59.8% at ten. So the width is derived
  // per deck count by `rangePValue` and this names the rate it buys.
  //
  // WHAT THIS RATE IS NOT is the share of SERVED questions that are noise, and
  // the gap between the two is the honest number to quote. Measured over the
  // eighteen sets with a cached pool: 2,652 candidates, of which a Storey
  // estimate off the p-value distribution puts ~90% under the null, and a
  // parametric bootstrap at the real sample sizes fires the gate on 3.14% of
  // them. That is ~75 false questions in a bank of 252 -- about a THIRD of what
  // gets served, not a twentieth.
  //
  // Controlling that directly with Benjamini-Hochberg was measured and is not
  // an option: at the same 5% it leaves a bank of 25 across all eighteen sets
  // and exactly one of them can fill a run. There is no operating point that is
  // both clean and playable, because only ~270 of the 2,652 cards genuinely
  // have a deck that wants them more and the effects are small beside their own
  // error bars. That is a fact about Limited rather than about this code.
  //
  // So five per cent does not gate the bank any more -- it decides which of
  // three ANSWERS a question has. A card the decks cannot be separated on is
  // asked about too, and "these two want it the same" is the right answer,
  // which is true of most cards in a colour and is the most useful thing a
  // drafter can learn about their own reads. See `dealArchetypeRun`.
  falsePositive: 0.05,
};

/**
 * The deck-speed drill: how sharp a measurement has to be to be worth asking
 * about, and how far from flat a card has to sit before it has an end.
 *
 * Its own block beside ARCHETYPE_QUIZ, and both settings are derived rather than
 * picked -- see `deckSpeedQuestions` for the argument each one comes from.
 */
export const DECK_SPEED = {
  // A run. Eight, matching the archetype quiz, for the same reason: one card and
  // three words is a couple of minutes at this length. The banks are not the
  // binding constraint here -- fdn holds 246 askable cards where the archetype
  // quiz holds a handful -- so the number is set by the sitting rather than by
  // what a set can fill.
  runLength: 8,
  // How many error bars from flat before a card is called fast or slow rather
  // than middle. Two, the width `gapMargin` and the rest of this codebase use,
  // and a width rather than a rate because the test is one number against a
  // fixed point -- nothing here moves with a deck count the way the archetype
  // quiz's range does.
  width: 2,
  // How sharp an estimate must be to be asked about at all, as a fraction of the
  // set's own spread of residuals. Below this the card is not asked about at
  // all: an estimate vaguer than half the spread cannot support any of the three
  // answers. Against the set's own spread rather than a turn count, because that
  // spread runs 0.11 to 0.17 between sets and a fixed threshold would ask about
  // a different fraction of each one.
  //
  // NOTE WHAT `middle` THEREFORE MEANS -- two conditions, not one. A card is
  // called neither when it sits inside half a set-spread of flat, OR when the
  // data cannot separate it from flat. Both are honest, and they are different
  // findings: the first says the difference is too small to matter, the second
  // says we cannot see it. The screen says "too close to call" for the first and
  // draws a span touching the rule for the second.
  precision: 0.5,
  // How far from flat a card must sit before it is called fast or slow, as a
  // fraction of the set's own spread.
  //
  // THIS EXISTS BECAUSE THE Z TEST ALONE MEASURED SAMPLE SIZE. `width` asks
  // whether the data can SEE a difference, and with 30,000 games it can see four
  // hundredths of a turn -- so the first version of this graded Healer's Hawk
  // (-0.042 turns, 28,755 games) as a card whose decks end games early, and
  // Rite of the Dragoncaller (+0.143 over 1,446 games, three times the effect)
  // as neither. The middle bucket's largest effect exceeded the ends' median:
  // the two overlapped outright, and the answer tracked how much a card gets
  // played rather than how fast its decks were.
  //
  // So a card gets an end only when BOTH are true -- the data can see the
  // difference, and the difference is worth a sentence. Neither implies the
  // other, which is the whole finding. At half the spread the buckets stop
  // overlapping on fdn by construction: middle tops out at 0.084 turns and the
  // ends start at 0.085.
  floor: 0.5,
  // Games a card needs before its residual is read at all.
  //
  // THE PIPELINE'S FLOOR GOVERNS, and this one cannot raise the pool above it.
  // `MIN_SPEED_GAMES` in build-set-stats.mjs decides which cards get a residual
  // written at all; that script imports no core, so the two cannot check each
  // other. This is the reader's floor: it re-filters what the artifact carries,
  // which matters when an artifact was built under a lower one. Raising this
  // above the script's is the only edit that does something on its own.
  minGames: 400,
};

export const DRILLS = {
  // How many questions one run of the misses drill deals. Ten because that is
  // what a draft's digest keeps of its own worst picks (DIGEST_MISTAKES), so a
  // run can always be filled from a single draft's history if that is all there
  // is -- and because a run that outlasts one sitting is not the point.
  runLength: 10,
  // How far back through finished drafts a run draws from. The same 25 the
  // review picker lists, and for the same reason: this reads a session document
  // per draft in the window before it knows whether any of them contributed a
  // question, so the window is a bill paid up front.
  draftWindow: 25,
};
