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

  // 17Lands ratings (undefined when the set/card has no data).
  gihWinRate?: number; // ever_drawn_win_rate, 0-1
  gihGames?: number; // ever_drawn_game_count (sample size)
  alsa?: number; // avg_seen — average last seen at
  avgPick?: number;
  winRate?: number;
}

export interface SetData {
  code: string;
  cards: Card[];
  byName: Map<string, Card>;
  // Draftable (non-basic-land) cards partitioned by rarity for pack generation.
  pools: {
    common: Card[];
    uncommon: Card[];
    rare: Card[];
    mythic: Card[];
  };
  // Archetype color-pair win rates from 17Lands color_ratings, keyed like "WU".
  colorPairWinRates: Map<string, number>;
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
