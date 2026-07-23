export type Rarity = "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";

export type ColorCode = "W" | "U" | "B" | "R" | "G";

export interface Card {
  name: string;
  rarity: Rarity;
  colors: ColorCode[];
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

  // 17Lands ratings (undefined when the set/card has no data).
  gihWinRate?: number; // ever_drawn_win_rate, 0-1
  gihGames?: number; // ever_drawn_game_count (sample size)
  // What an unrated card of this rarity is worth in this set, measured from the
  // set's own rated cards instead of guessed (see observedRarityBaselines).
  // A per-rarity constant, denormalised onto every card so `cardValue(card)`
  // needs no set context -- otherwise bots, the deck builder and scoring would
  // all have to thread it through their signatures. Costs ~8KB on a 164KB set
  // document. Absent for sets ingested before this, which fall back to
  // RARITY_BASELINE and score exactly as they did.
  rarityBaseline?: number;
  alsa?: number; // avg_seen — average last seen at
  avgPick?: number;
  winRate?: number;
}

// The kinds of slot a booster draws from. `bonus` covers whatever sheet the set
// pairs with (Mystical Archive, Special Guests); `land` is the Play Booster land
// slot, which is a real pick and not filler.
export type PackSlot = "common" | "uncommon" | "rare" | "mythic" | "bonus" | "land";

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
  cards: Card[];
  byName: Map<string, Card>;
  // Cards partitioned by the slot they fill. `common`..`mythic` hold main-set
  // cards only, so a bonus sheet cannot leak into an ordinary rarity slot.
  pools: {
    common: Card[];
    uncommon: Card[];
    rare: Card[];
    mythic: Card[];
    bonus: Card[];
    land: Card[];
  };
  // Archetype color-pair win rates from 17Lands color_ratings, keyed like "WU".
  colorPairWinRates: Map<string, number>;
  // Observed booster shapes. Absent for sets we have no draft data for; pack
  // generation then falls back to the PACK constants.
  packComposition?: PackComposition;
}

export const isBasicLand = (c: { typeLine: string }) =>
  /\bBasic\b/.test(c.typeLine) && /\bLand\b/.test(c.typeLine);

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
