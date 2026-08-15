import { describe, expect, it } from "vitest";
import { textHalf } from "../convex/cardText.js";
import { cardText } from "../convex/validators.js";
import type { StoredCard } from "../convex/validators.js";

// A card with every optional field populated, so nothing is dropped by
// `defined()` for the honest reason of being absent. Values are sentinels; only
// their presence is under test.
const complete: StoredCard = {
  name: "Beluna's Gatekeeper // Entry Denied",
  colors: ["U"],
  slot: "common",
  packRate: 1,
  value: 50,
  rarity: "common",
  colorIdentity: ["U"],
  gihWinRate: 0.55,
  gihGames: 1000,
  alsa: 5.5,
  rarityBaseline: 0.54,
  manaCost: "{5}{U} // {1}{U}",
  cmc: 6,
  typeLine: "Creature — Giant Soldier // Sorcery — Adventure",
  oracleText: "...",
  power: "4",
  toughness: "4",
  loyalty: "3",
  imageUrl: "https://example.invalid/front.jpg",
  layout: "adventure",
  backImageUrl: "https://example.invalid/back.jpg",
  tokens: [{ name: "Insect", typeLine: "Token Creature — Insect" }],
  collectorNumber: "51",
  setCode: "woe",
  avgPick: 4.07,
  winRate: 0.55,
  iwd: 0.02,
  maindeckRate: 0.6,
};

describe("textHalf", () => {
  // `textHalf` is a hand-written projection, so a field can be added to CardText,
  // to the validator and to the mapping, and still never reach the database
  // because one function in the middle was not updated. That is exactly what
  // happened to `layout` and `backImageUrl`: Scryfall returned them, mergeCards
  // mapped them, the validator accepted them, and every stored row had neither --
  // because the tests covered mergeCards, one step upstream of the hole.
  //
  // Comparing key sets rather than checking the two fields by name is the point.
  // Naming them would pin today's bug and let the next one through.
  it("stores every field the validator declares", () => {
    expect(Object.keys(textHalf(complete)).sort()).toEqual(Object.keys(cardText.fields).sort());
  });

  // The guard above only works while the fixture is complete: an absent field
  // and a dropped one are the same thing once `defined()` has run, so a fixture
  // that quietly loses a field would turn the test green by making it blind.
  it("keeps the fixture exhaustive", () => {
    const missing = Object.keys(cardText.fields).filter(
      (k) => complete[k as keyof StoredCard] === undefined,
    );
    expect(missing).toEqual([]);
  });
});
