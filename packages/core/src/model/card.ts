export type Rarity = "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

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
  // Still here, unlike the four statistics that left with `value`. Moving it
  // costs ~10% of this document and nothing reads it after ingest -- but it is
  // also what `withPackSlots` and `computeCardValue` run on, so taking it off
  // storage means giving ingest its own card type. Worth doing, separately.
  rarity: Rarity;
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
  colorIdentity: ColorCode[];
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  imageUrl?: string;
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
  // Archetype color-pair win rates from 17Lands color_ratings, keyed like "WU".
  colorPairWinRates: Map<string, number>;
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
