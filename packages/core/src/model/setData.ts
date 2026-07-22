import { type Card, type SetData, isBasicLand, normalizeName } from "./card.js";

// Rebuilds the derived halves of SetData (the name index and the rarity pools)
// from a flat card list. Shared so the CLI's Scryfall merge and the server's
// stored-set read produce byte-identical draft state.
export function buildSetData(
  code: string,
  cards: Card[],
  colorPairWinRates: Map<string, number> = new Map(),
): SetData {
  const draftable = cards.filter((c) => !isBasicLand(c));

  return {
    code,
    cards,
    byName: new Map(cards.map((c) => [normalizeName(c.name), c])),
    pools: {
      common: draftable.filter((c) => c.rarity === "common"),
      uncommon: draftable.filter((c) => c.rarity === "uncommon"),
      rare: draftable.filter((c) => c.rarity === "rare"),
      mythic: draftable.filter((c) => c.rarity === "mythic"),
    },
    colorPairWinRates,
  };
}

// How many cards actually carry 17Lands data. Below a couple dozen, scoring is
// leaning on rarity baselines and the caller should say so.
export function ratedCardCount(set: SetData): number {
  return set.cards.filter((c) => c.gihWinRate != null).length;
}
