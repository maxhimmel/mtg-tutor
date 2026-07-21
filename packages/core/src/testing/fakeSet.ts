// Synthetic set data for tests. Lives outside the build (see tsconfig exclude)
// so it never ships in dist.

import type { Card, ColorCode, Rarity, SetData } from "../model/card.js";
import { normalizeName } from "../model/card.js";

export function mkCard(
  name: string,
  rarity: Rarity,
  colors: ColorCode[],
  gih: number,
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
    },
    colorPairWinRates: new Map(),
  };
}
