// Synthetic set data for tests. Lives outside the build (see tsconfig exclude)
// so it never ships in dist.

import type { Card, ColorCode, PackComposition, Rarity, SetData } from "../model/card.js";
import { buildSetData } from "../model/setData.js";
import { normalizeName } from "../model/card.js";

export function mkCard(
  name: string,
  rarity: Rarity,
  colors: ColorCode[],
  gih: number,
  overrides: Partial<Card> = {},
): Card {
  return {
    name,
    rarity,
    colors,
    colorIdentity: colors,
    manaCost: "",
    cmc: 2,
    typeLine: "Creature",
    oracleText: "",
    collectorNumber: name,
    gihWinRate: gih,
    gihGames: 5000,
    alsa: 8,
    ...overrides,
  };
}

// A set with enough cards in every rarity pool to generate real packs.
export function fakeSet(): SetData {
  const cards: Card[] = [];
  const colors: ColorCode[] = ["W", "U", "B", "R", "G"];

  for (let i = 0; i < 60; i++) {
    cards.push(mkCard(`C${i}`, "common", [colors[i % 5]], 0.48 + (i % 10) * 0.005));
  }
  for (let i = 0; i < 30; i++) {
    cards.push(mkCard(`U${i}`, "uncommon", [colors[i % 5]], 0.5 + (i % 10) * 0.005));
  }
  for (let i = 0; i < 20; i++) {
    cards.push(mkCard(`R${i}`, "rare", [colors[i % 5]], 0.55));
  }
  for (let i = 0; i < 10; i++) {
    cards.push(mkCard(`M${i}`, "mythic", [colors[i % 5]], 0.58));
  }

  return {
    code: "tst",
    cards,
    byName: new Map(cards.map((c) => [normalizeName(c.name), c])),
    pools: {
      common: cards.filter((c) => c.rarity === "common"),
      uncommon: cards.filter((c) => c.rarity === "uncommon"),
      rare: cards.filter((c) => c.rarity === "rare"),
      mythic: cards.filter((c) => c.rarity === "mythic"),
      bonus: [],
      land: [],
    },
    colorPairWinRates: new Map(),
  };
}

// A Play Booster-shaped set: a bonus sheet from another set code, basic lands,
// and an observed composition. Mirrors what SOS ingestion produces.
export function fakePlayBoosterSet(composition?: PackComposition): SetData {
  const colors: ColorCode[] = ["W", "U", "B", "R", "G"];
  const cards: Card[] = [];

  for (let i = 0; i < 60; i++)
    cards.push(mkCard(`C${i}`, "common", [colors[i % 5]], 0.48, { setCode: "tst" }));
  for (let i = 0; i < 30; i++)
    cards.push(mkCard(`U${i}`, "uncommon", [colors[i % 5]], 0.5, { setCode: "tst" }));
  for (let i = 0; i < 20; i++)
    cards.push(mkCard(`R${i}`, "rare", [colors[i % 5]], 0.55, { setCode: "tst" }));
  for (let i = 0; i < 10; i++)
    cards.push(mkCard(`M${i}`, "mythic", [colors[i % 5]], 0.58, { setCode: "tst" }));
  // Bonus sheet: another set's cards, printed into this set's boosters.
  for (let i = 0; i < 25; i++)
    cards.push(mkCard(`B${i}`, "uncommon", [colors[i % 5]], 0.56, { setCode: "bns" }));
  for (const name of ["Plains", "Island", "Swamp", "Mountain", "Forest"])
    cards.push(mkCard(name, "common", [], 0.5, { setCode: "tst", typeLine: "Basic Land" }));

  return buildSetData(
    "tst",
    cards,
    new Map(),
    composition ?? {
      size: 14,
      shapes: [
        { slots: { rare: 1, uncommon: 4, common: 8, bonus: 1 }, weight: 60 },
        { slots: { rare: 1, uncommon: 4, common: 7, bonus: 1, land: 1 }, weight: 30 },
        { slots: { mythic: 1, uncommon: 3, common: 8, bonus: 1, land: 1 }, weight: 10 },
      ],
    },
  );
}
