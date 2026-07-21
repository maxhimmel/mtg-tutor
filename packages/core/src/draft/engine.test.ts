import { describe, it, expect } from "vitest";
import type { Card, Rarity, SetData, ColorCode } from "../model/card.js";
import { normalizeName } from "../model/card.js";
import { makePack } from "./pack.js";
import { Bot } from "./bots.js";
import { DraftEngine } from "./engine.js";
import { PACK, packSize } from "../config.js";

function mkCard(name: string, rarity: Rarity, colors: ColorCode[], gih: number): Card {
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

// Build a synthetic set with enough cards in every rarity pool.
function fakeSet(): SetData {
  const cards: Card[] = [];
  const colors: ColorCode[] = ["W", "U", "B", "R", "G"];
  for (let i = 0; i < 60; i++) cards.push(mkCard(`C${i}`, "common", [colors[i % 5]], 0.48 + (i % 10) * 0.005));
  for (let i = 0; i < 30; i++) cards.push(mkCard(`U${i}`, "uncommon", [colors[i % 5]], 0.5 + (i % 10) * 0.005));
  for (let i = 0; i < 20; i++) cards.push(mkCard(`R${i}`, "rare", [colors[i % 5]], 0.55));
  for (let i = 0; i < 10; i++) cards.push(mkCard(`M${i}`, "mythic", [colors[i % 5]], 0.58));
  const byName = new Map(cards.map((c) => [normalizeName(c.name), c]));
  return {
    code: "tst",
    cards,
    byName,
    pools: {
      common: cards.filter((c) => c.rarity === "common"),
      uncommon: cards.filter((c) => c.rarity === "uncommon"),
      rare: cards.filter((c) => c.rarity === "rare"),
      mythic: cards.filter((c) => c.rarity === "mythic"),
    },
    colorPairWinRates: new Map(),
  };
}

// Deterministic PRNG (mulberry32) for reproducible tests.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("makePack", () => {
  it("has the configured size and no duplicate names", () => {
    const pack = makePack(fakeSet(), rng(1));
    expect(pack.length).toBe(packSize());
    expect(new Set(pack.map((c) => c.name)).size).toBe(pack.length);
  });

  it("always contains exactly one rare or mythic", () => {
    const set = fakeSet();
    for (let s = 0; s < 50; s++) {
      const pack = makePack(set, rng(s));
      const bombs = pack.filter((c) => c.rarity === "rare" || c.rarity === "mythic");
      expect(bombs.length).toBe(PACK.rareOrMythic);
    }
  });
});

describe("Bot", () => {
  it("commits to colors over time", () => {
    const bot = new Bot(0, rng(7));
    const mono = (c: ColorCode, gih: number, n: number) => mkCard(`${c}${n}`, "common", [c], gih);
    // Feed packs where an on-color-ish choice exists; bot should lean into its early color.
    bot.pick([mono("U", 0.56, 1), mono("R", 0.55, 2)]); // takes U (slightly better)
    for (let i = 0; i < 5; i++) bot.pick([mono("U", 0.52, i + 10), mono("R", 0.53, i + 20)]);
    const blue = bot.pool.filter((c) => c.colors[0] === "U").length;
    const red = bot.pool.filter((c) => c.colors[0] === "R").length;
    expect(blue).toBeGreaterThan(red);
  });
});

describe("DraftEngine", () => {
  it("runs a full 45-pick draft with correct structure", () => {
    const engine = new DraftEngine(fakeSet(), rng(42));
    while (!engine.isComplete()) {
      const pack = engine.currentPack;
      engine.humanPick(pack[0]);
    }
    expect(engine.history.length).toBe(PACK.packsPerDraft * packSize());
    expect(engine.humanPool.length).toBe(engine.history.length);
    // First pick of each pack sees a full pack.
    const firsts = engine.history.filter((h) => h.pickNo === 1);
    expect(firsts.length).toBe(PACK.packsPerDraft);
    for (const f of firsts) expect(f.pack.length).toBe(packSize());
    // Last pick of a pack sees exactly one card.
    const lasts = engine.history.filter((h) => h.pickNo === packSize());
    for (const l of lasts) expect(l.pack.length).toBe(1);
  });
});
