// Synthetic set data for tests. Lives outside the build (see tsconfig exclude)
// so it never ships in dist.

import type {
  Card,
  ColorCode,
  PackComposition,
  IngestCard,
  Rarity,
  SetData,
} from "../model/card.js";
import { buildSetData, withPackSlots } from "../model/setData.js";
import { computeCardValue } from "../scoring/value.js";

export function mkCard(
  name: string,
  rarity: Rarity,
  colors: ColorCode[],
  gih: number,
  overrides: Partial<Card> = {},
): IngestCard & { value: number } {
  const base: IngestCard = {
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
  // Settled the same way ingest settles it, and after the overrides, so a
  // fixture that sets rarityBaseline or a thin gihGames gets the value that
  // implies rather than the default's.
  return { ...base, value: overrides.value ?? computeCardValue(base) };
}

// A set with enough cards in every rarity pool to generate real packs.
export function fakeSet(): SetData {
  const cards: (IngestCard & { value: number })[] = [];
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

  // Through withPackSlots and buildSetData rather than assembling the pools by
  // hand, so a fixture cannot drift from how ingestion actually partitions a
  // set. None of these carry a setCode or a land type line, so every one lands
  // in its own rarity and the bonus and land pools come out empty.
  return buildSetData("tst", withPackSlots("tst", cards));
}

// A Play Booster-shaped set: a bonus sheet from another set code, basic lands,
// and an observed composition. Mirrors what SOS ingestion produces.
export function fakePlayBoosterSet(composition?: PackComposition): SetData {
  const colors: ColorCode[] = ["W", "U", "B", "R", "G"];
  const cards: (IngestCard & { value: number })[] = [];

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
    withPackSlots("tst", cards),
    [],
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

// A set whose cards do NOT all sit on the same branch of `cardValue`.
//
// `fakeSet` and `fakePlayBoosterSet` give every card `gihGames: 5000` and
// `alsa: 8`, so every lookup takes the trusted-win-rate branch and returns raw
// GIH. That leaves the rarity baseline, the thin-sample blend and the ALSA nudge
// unexercised -- which is the wrong half to leave uncovered, because those are
// the paths a freshly released set runs on, and a change that moves them strands
// exactly the drafts nobody has replayed yet.
//
// Roughly FDN's shape: ~73% of cards rated, the rest unrated or thin.
export function fakeMixedSet(): SetData {
  const colors: ColorCode[] = ["W", "U", "B", "R", "G"];
  const cards: (IngestCard & { value: number })[] = [];

  // Spread across the pivot (8) in both directions so the nudge is signed, and
  // past the clamp at both ends so saturation is covered too.
  const alsaFor = (i: number) => 1 + ((i * 3) % 14);

  const add = (name: string, rarity: Rarity, i: number, count: number) => {
    const kind = i % 10;
    const over: Partial<Card> =
      kind < 7
        ? { gihGames: 5000, alsa: alsaFor(i) }
        : kind < 9
          ? // Thin sample: below minSampleForWinRate, so the blend runs.
            { gihGames: 40, alsa: alsaFor(i) }
          : // Never rated: baseline + nudge only.
            { gihWinRate: undefined, gihGames: 0, alsa: alsaFor(i) };
    // Half carry a measured baseline, half fall through to the constant.
    if (i % 2 === 0) over.rarityBaseline = 0.6 + (i % 5) * 0.004;
    cards.push(mkCard(name, rarity, [colors[i % 5]], 0.48 + (i % count) * 0.004, over));
  };

  for (let i = 0; i < 60; i++) add(`C${i}`, "common", i, 10);
  for (let i = 0; i < 30; i++) add(`U${i}`, "uncommon", i, 8);
  for (let i = 0; i < 20; i++) add(`R${i}`, "rare", i, 6);
  for (let i = 0; i < 10; i++) add(`M${i}`, "mythic", i, 4);

  return buildSetData("mix", withPackSlots("mix", cards));
}
