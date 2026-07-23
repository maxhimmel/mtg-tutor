import {
  type Card,
  type PackComposition,
  type SetData,
  isBasicLand,
  normalizeName,
} from "./card.js";

// A card belongs to a bonus sheet when its own set differs from the set being
// drafted -- Mystical Archive and Special Guests print into a set's boosters
// without being part of it. Cards ingested before `setCode` existed have none,
// and are treated as main-set so old sets keep behaving exactly as before.
const isBonusSheet = (card: Card, code: string) =>
  card.setCode != null && card.setCode.toLowerCase() !== code.toLowerCase();

// Rebuilds the derived halves of SetData (the name index and the slot pools)
// from a flat card list. Shared so the CLI's Scryfall merge and the server's
// stored-set read produce byte-identical draft state.
export function buildSetData(
  code: string,
  cards: Card[],
  colorPairWinRates: Map<string, number> = new Map(),
  packComposition?: PackComposition,
): SetData {
  const mainSet = cards.filter((c) => !isBasicLand(c) && !isBonusSheet(c, code));
  const byRarity = (rarity: string) => mainSet.filter((c) => c.rarity === rarity);

  return {
    code,
    cards,
    byName: new Map(cards.map((c) => [normalizeName(c.name), c])),
    pools: {
      common: byRarity("common"),
      uncommon: byRarity("uncommon"),
      rare: byRarity("rare"),
      mythic: byRarity("mythic"),
      bonus: cards.filter((c) => !isBasicLand(c) && isBonusSheet(c, code)),
      land: cards.filter((c) => isBasicLand(c)),
    },
    colorPairWinRates,
    packComposition,
  };
}

// How many cards actually carry 17Lands data. Below a couple dozen, scoring is
// leaning on rarity baselines and the caller should say so.
export function ratedCardCount(set: SetData): number {
  return set.cards.filter((c) => c.gihWinRate != null).length;
}
