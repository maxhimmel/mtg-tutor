export type Rarity = "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

import type { CardRole } from "./role.js";
export type { CardRole };

// The kinds of slot a booster draws from. `bonus` covers whatever sheet the set
// pairs with (Mystical Archive, Special Guests); `land` is the Play Booster land
// slot, which is a real pick and not filler.
export type PackSlot = "common" | "uncommon" | "rare" | "mythic" | "bonus" | "land";

/**
 * What the draft engine reads: everything dealing a pack, running the bots and
 * scoring a pick needs, and nothing else.
 *
 * Split from the rest of a card because Convex bills for the whole document a
 * function retrieved rather than the fields it used, and replaying a draft
 * reads the set's ENTIRE card list on every pick. Two thirds of that list was
 * rules text and image URLs the engine never looks at. Keeping the split in the
 * type system rather than only in the schema means the compiler refuses an
 * engine that reaches for a field the engine's document does not carry --
 * otherwise the saving would quietly decay the first time scoring wanted a
 * type line.
 */
export interface EngineCard {
  name: string;
  colors: ColorCode[];
  // Which pool this card is dealt from, decided at ingest rather than derived
  // from the type line on every replay. It is also the last thing that needed
  // `typeLine` and `setCode` on the engine's half of a card.
  //
  // Absent for a card that belongs to no pool -- a main-set card of an odd
  // rarity is never dealt, and was never dealt before this field existed
  // either.
  slot?: PackSlot;
  // How often this card was actually opened, as a fraction of observed packs.
  // Cards within a slot are NOT equally likely: a real bonus sheet is weighted
  // by rarity, and SOS's Mystical Archive runs 18:2:1 across uncommon/rare/
  // mythic -- so drawing its 65 cards evenly deals a Mystical Archive mythic
  // about seven times too often. Absent for sets built before this was measured,
  // which keep drawing uniformly and so keep replaying identically.
  packRate?: number;

  /**
   * The curve bucket this card comes down in, 1..CURVE_TOP, and what it does.
   *
   * WHY THE ENGINE'S HALF CARRIES THESE AT ALL
   *
   * Everything else here is read by dealing a pack or scoring a pick, and these
   * are the exception that proves the rule rather than a lapse: they are read by
   * scoring a pick, and they could not be until now.
   *
   * The draft principles a pick is judged against are about the DECK -- how the
   * curve is filling, whether there are enough bodies, whether the removal is
   * there (DECK-06, DECK-08, CURVE-01/03/04). Answering any of those needs a
   * mana value and a role, which live on the text half. So the tiebreak that
   * reads them could only ever run in the browser, where cards are hydrated,
   * while the grade ran on the server -- and the two disagreed about the same
   * pack three separate times before anybody traced it to this type.
   *
   * Settling both at ingest is what makes the two sides symmetric. Not a new
   * request path and not a query: the browser already holds the pack and the
   * pool as EngineCards, the server already holds the maindeck as EngineCards,
   * and once the cards carry these, both run the same code over the same data.
   * The CLI gets it for nothing, which it did not have before at all.
   *
   * WHAT IT COSTS, MEASURED
   *
   * fdn's pool document goes 20.6KB -> 27.7KB, and it is read on all 42 picks:
   * +297KB a draft, about +9.7% of the 2.98MB a draft and its review move today.
   * A single packed integer would have been +3.1%, and was declined -- an opaque
   * field is a precedent this codebase has not set, and the I/O picture is worth
   * a pass of its own rather than being paid for here in unreadability.
   *
   * Optional because a pool ingested before they existed has neither, and a
   * Convex push validates every stored document. A card without them contributes
   * to no deck need and meets none, which is the honest reading of "not known"
   * and never "meets nothing".
   *
   * NOT read by any bot. `POLICY_FEATURES` does not mention them and
   * `BOT_FINGERPRINT` does not move, so no deal changes and no draft is
   * stranded -- `corpus.test.ts` is the tripwire.
   */
  turn?: number;
  role?: CardRole;

  // What `cardValue` resolves to, settled once at ingest.
  //
  // This field is why the rest of them left. `cardValue` read gihWinRate,
  // gihGames, rarityBaseline, alsa and rarity, and none of those change between
  // ingests -- so a draft replay was re-deriving a constant for every card in
  // the set on every one of 42 picks, and the five inputs were on the hot path
  // only because the formula was. They are on CardText now, where the readers
  // that actually want to SHOW them already look.
  //
  // Required, not optional: the formula's inputs no longer exist here, so a card
  // without this cannot be scored at all. Ingestion writes it for every card and
  // the schema push is what proves no stored pool is missing one.
  value: number;
}

/**
 * What a person reads: rules text, art, and the statistics that make a win rate
 * legible next to it. Read when a card is rendered or written into a prompt,
 * which is a handful of cards at a time -- never the whole set on a pick.
 */
export interface CardText {
  name: string;
  // On this half because the readers left are the ones that PRINT it -- the CLI
  // tags every card in a pack with C/U/R/M. What it is not is an engine field:
  // it decides a card's pack slot and its baseline value, both settled once at
  // ingest, and dealing reads `slot` rather than this.
  //
  // Optional because a row written before it moved here has none; `rarityTag`
  // renders "?" for that, as it already did for any unrecognised rarity.
  rarity?: Rarity;
  colorIdentity: ColorCode[];
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  imageUrl?: string;
  // Scryfall's own word for how the card is printed, stored only when it is not
  // `normal`. 4,776 of the 5,079 cards across the seventeen ingested sets are
  // normal, so the field is absent on 94% of rows and the other 303 are the
  // whole reason it exists.
  //
  // Nothing else stored can stand in for it. A two-in-one card's type line is
  // "Creature — Faerie Rogue // Instant — Adventure" and a transforming card's
  // is "Legendary Creature — Kithkin Warrior // Legendary Creature — Kithkin
  // Soldier": both halves are visible at once in the first case and one has to
  // be turned over in the second, and only this says which.
  layout?: string;
  // The other side's art, and only for the layouts that print one. `transform`
  // is the sole one in the pool whose faces carry their own `image_uris`; an
  // Adventure, an Omen, a Room and a split card all put both halves on the
  // single picture the player is already looking at, so a "see the back" popup
  // for those would show a second copy of the front.
  backImageUrl?: string;
  collectorNumber: string;
  // Scryfall set code. Differs from the set being drafted for bonus-sheet and
  // Special Guest cards, which appear in packs without belonging to the set.
  // Absent on sets ingested before those were modelled; treated as main-set.
  setCode?: string;
  avgPick?: number; // ATA — the mean pick number it is actually taken at
  winRate?: number; // GP WR — games-played win rate

  // 17Lands ratings (undefined when the set/card has no data). These are what
  // `EngineCard.value` is computed FROM at ingest, so they moved here with it:
  // once the answer is stored, the inputs are only ever shown to a person or
  // written into a prompt, and both of those read a handful of cards.
  gihWinRate?: number; // ever_drawn_win_rate, 0-1
  gihGames?: number; // ever_drawn_game_count (sample size)
  // What an unrated card of this rarity is worth in this set, measured from the
  // set's own rated cards instead of guessed (see observedRarityBaselines).
  rarityBaseline?: number;
  // The mean pick number over every time a drafter saw this card in a pack --
  // 17Lands calls it "average last seen at", but it is a mean over all sightings,
  // not the last one, which is why it sits BELOW avgPick rather than above it
  // (a circulating card is seen by many drafters early and taken by one late).
  // The gap avgPick - alsa is how long it survives once people start seeing it.
  alsa?: number;

  // gihWinRate minus the win rate of games where the card sat in the deck and was
  // never drawn. Both halves come from the same decks, so deck quality cancels and
  // what is left is the card's own contribution -- which raw GIH WR confounds: a
  // fine card in a strong archetype posts a high GIH because good decks win.
  // A fraction, like the win rates (0.049 = 4.9 percentage points), and absent
  // unless both halves cleared the sample floor when the artifact was built.
  iwd?: number;
  // Of the drafters who took this card, how many actually played it. A high pick
  // rate with a low maindeck rate is a trap, and a low rate on its own means the
  // GIH WR above was measured on a self-selected sample and deserves less trust.
  maindeckRate?: number;
}

/**
 * What scoring reads to judge a card against the deck being built, rather than
 * on its own.
 *
 * A third table, and for the same reason `setCardText` is a second one: its
 * readers want SUBSETS. Choosing the context-best card in a pack needs this for
 * the ~14 cards in that pack, never for the set -- so it cannot ride the pool
 * document, which is read whole on every pick and which two commits just spent
 * some effort shrinking.
 *
 * `iwd` and `maindeckRate` are duplicated from CardText on purpose. Scoring
 * needs them, the text row is not otherwise on the pick path, and two numbers a
 * card is cheaper than a second read of a different table.
 */
export interface CardContext {
  // This card's win rate inside each archetype, keyed by the deck's real
  // colours -- "WU", and also "WUB".
  //
  // 82-97% of rated cards carry SOME archetype, median 93% -- but a lookup
  // wants the one you are actually in, and that is thinner: about 43% of fdn's
  // rated cards have a row for UB specifically. A card needs 200 games inside
  // an archetype to appear in it at all. Absent means no signal, not zero.
  archWr?: Record<string, number>;
  // Opening-hand win rate minus drawn-later win rate: whether a card wants the
  // game short or long. Measured at corr 0.022 with GIH WR across all 17 sets,
  // which is what makes it worth storing -- it is a second axis, not a
  // restatement of the first.
  speed?: number;
  iwd?: number;
  maindeckRate?: number;
  /**
   * One standard error on this card's GIH win rate: sqrt(p(1-p)/n).
   *
   * Settled at ingest, exactly like `value`, and for the same reason -- the
   * inputs are on the text half of a card and the pick path has neither.
   *
   * WHY IT LIVES HERE AND NOT ON EngineCard
   *
   * `gapMargin` has always existed and has always run in the BROWSER, over
   * hydrated cards, which is why the verdict can say "the data cannot tell these
   * two apart" while the grade behind it -- computed server-side in `draft.pick`
   * -- charges for the difference anyway. Closing that needed the margin on the
   * pick path.
   *
   * The obvious home was EngineCard, and it is the expensive one: `setCards` is
   * a single document read on all 42 picks, so a number per card costs
   * ~3.4-4.4KB x 42, about +5.1% of a draft's total I/O. `setCardContext` is
   * already read for the PACK on every pick -- fourteen rows -- so the same
   * number rides a read that is happening regardless, at ~180 bytes a pick and
   * +0.3%. Nineteen times cheaper, and this is the table whose whole definition
   * is "what scoring reads to judge a card".
   *
   * Absent for an unrated card, and that absence is load-bearing: a rarity
   * baseline is not a measurement and has no error bars, so there is no margin
   * and no claim that two cards are the same. See `marginBetween`.
   */
  se?: number;
}

/** A whole card: what the engine reads, plus what a person reads. */
export type Card = EngineCard & CardText;

/**
 * A card between the Scryfall/17Lands merge and ingest settling its `value`.
 *
 * `value` depends on the set's measured rarity baselines, which cannot be
 * computed until every card has been merged -- so there is a real stage where a
 * card is complete except for that one field. Naming it stops the alternative,
 * which is making `value` optional on EngineCard and letting every reader
 * downstream wonder whether a card might not have one.
 */
export type UnvaluedCard = Omit<Card, "value">;

/**
 * What ingest works with: a card that definitely knows its rarity.
 *
 * Storage does not keep rarity on the hot half and does not require it on the
 * other, but the pipeline that produces a card always has it -- Scryfall says so
 * on every printing -- and `packSlotFor`, `computeCardValue` and
 * `observedRarityBaselines` all need it. Naming that asymmetry is what lets
 * `EngineCard` drop the field without those three losing their input.
 */
export type IngestCard = UnvaluedCard & { rarity: Rarity };

/**
 * The least a pool needs to be worth summarising.
 *
 * A prompt renders a pool as names grouped by colour and nothing else, so this
 * is the entire dependency -- which is what lets a stored pick carry its own
 * pool in ~30 bytes a card instead of reading the set to rebuild one.
 */
export type PoolCard = Pick<EngineCard, "name" | "colors">;

// One observed booster shape and how often it was seen. Real Play Boosters have
// a wildcard slot, so a set has no single fixed rarity mix -- SOS packs range
// over 5-9 commons and 0-3 rares across 66 distinct shapes. Sampling the
// observed distribution reproduces that; a fixed formula cannot.
export interface PackShape {
  slots: Partial<Record<PackSlot, number>>;
  weight: number;
}

// One archetype's own win rate, with no card dimension.
export interface ColorWinRate {
  colors: string;
  n: number;
  wr: number;
}

export interface PackComposition {
  size: number;
  shapes: PackShape[];
}

export interface SetData {
  code: string;
  cards: EngineCard[];
  byName: Map<string, EngineCard>;
  // Cards partitioned by the slot they fill. `common`..`mythic` hold main-set
  // cards only, so a bonus sheet cannot leak into an ordinary rarity slot.
  pools: {
    common: EngineCard[];
    uncommon: EngineCard[];
    rare: EngineCard[];
    mythic: EngineCard[];
    bonus: EngineCard[];
    land: EngineCard[];
  };
  // How each archetype in this format actually did, keyed by the deck's real
  // colours -- "WU", but also "WUB" and beyond. Not filtered to pairs: three
  // colours is the majority archetype in ktk and snc, and the cost of a third
  // colour is the difference between these rates rather than a constant.
  //
  // `n` is carried because aggregating by colour count has to weight by it.
  colorWinRates: ColorWinRate[];
  // Observed booster shapes. Absent for sets we have no draft data for; pack
  // generation then falls back to the PACK constants.
  packComposition?: PackComposition;
}

// Front face only: a creature that transforms into a land is a creature you
// cast, not a land you play.
const frontFace = (typeLine: string) => typeLine.split("//")[0];

export const isLand = (c: { typeLine: string }) => /\bLand\b/.test(frontFace(c.typeLine));

export const isBasicLand = (c: { typeLine: string }) =>
  /\bBasic\b/.test(frontFace(c.typeLine)) && isLand(c);

// Match names across 17Lands and Scryfall: lowercase, front face of DFCs,
// strip accents/punctuation noise.
export function normalizeName(name: string): string {
  const front = name.split("//")[0];
  return front
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}
