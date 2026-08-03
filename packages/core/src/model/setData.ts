import {
  type Card,
  type EngineCard,
  type PackComposition,
  type PackSlot,
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

/**
 * Which pool a card is dealt from. Decided once, when a set is ingested, rather
 * than re-derived from the type line on every replay -- which is what lets the
 * engine's half of a card drop `typeLine` and `setCode` entirely.
 *
 * Undefined for a card that belongs to no pool. A main-set card whose rarity is
 * neither common, uncommon, rare nor mythic was never dealt before this existed
 * either: it fell through every branch of the partition this replaces.
 */
export function packSlotFor(card: Card, code: string): PackSlot | undefined {
  if (isBasicLand(card)) return "land";
  if (isBonusSheet(card, code)) return "bonus";
  switch (card.rarity) {
    case "common":
    case "uncommon":
    case "rare":
    case "mythic":
      return card.rarity;
    default:
      return undefined;
  }
}

// Generic so a caller holding something more specific than a Card -- ingest
// holds one that definitely knows its rarity -- does not lose that on the way
// through, which is the difference between the split compiling and not.
export function withPackSlots<T extends Card>(code: string, cards: T[]): T[] {
  return cards.map((c) => ({ ...c, slot: packSlotFor(c, code) }));
}

// Rebuilds the derived halves of SetData (the name index and the slot pools)
// from a flat card list. Shared so the CLI's Scryfall merge and the server's
// stored-set read produce byte-identical draft state.
export function buildSetData(
  code: string,
  cards: EngineCard[],
  colorPairWinRates: Map<string, number> = new Map(),
  packComposition?: PackComposition,
): SetData {
  const inSlot = (slot: PackSlot) => cards.filter((c) => c.slot === slot);
  const pools = {
    common: inSlot("common"),
    uncommon: inSlot("uncommon"),
    rare: inSlot("rare"),
    mythic: inSlot("mythic"),
    bonus: inSlot("bonus"),
    land: inSlot("land"),
  };

  // A set with cards in it and nothing to deal them from is always a caller
  // that forgot withPackSlots. Left alone it is silent: makePack draws from
  // empty pools, every booster comes out zero cards long, and the draft ends
  // instantly rather than throwing anywhere near the mistake.
  if (cards.length > 0 && Object.values(pools).every((p) => p.length === 0)) {
    throw new Error(
      `Set "${code}" has ${cards.length} cards and no pools: none of them carry a pack slot. ` +
        `Stamp them with withPackSlots(code, cards) before calling buildSetData.`,
    );
  }

  return {
    code,
    cards,
    byName: new Map(cards.map((c) => [normalizeName(c.name), c])),
    pools,
    colorPairWinRates,
    packComposition,
  };
}

