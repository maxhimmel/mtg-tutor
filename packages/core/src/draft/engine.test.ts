import { describe, it, expect } from "vitest";
import type { ColorCode } from "../model/card.js";
import { makePack } from "./pack.js";
import { Bot } from "./bots.js";
import { DraftEngine } from "./engine.js";
import { PACK, packSize } from "../config.js";
import { fakeSet, mkCard } from "../testing/fakeSet.js";
import { mulberry32 as rng } from "../util/rng.js";

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
