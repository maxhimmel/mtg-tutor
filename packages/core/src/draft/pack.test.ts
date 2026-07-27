import { describe, expect, it } from "vitest";
import { makePack, packSizeFor } from "./pack.js";
import { DraftEngine } from "./engine.js";
import { fakePlayBoosterSet, fakeSet } from "../testing/fakeSet.js";
import { mulberry32 } from "../util/rng.js";
import { PACK, packSize } from "../config.js";
import { isBasicLand } from "../model/card.js";

describe("makePack with observed composition", () => {
  const set = fakePlayBoosterSet();

  it("deals the observed pack size, not the fixed 15", () => {
    const rng = mulberry32(7);
    expect(packSizeFor(set)).toBe(14);
    for (let i = 0; i < 50; i++) expect(makePack(set, rng).length).toBe(14);
  });

  it("puts a bonus-sheet card in every pack", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const bonus = makePack(set, rng).filter((c) => c.setCode === "bns");
      expect(bonus.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("never leaks bonus-sheet cards into ordinary rarity slots", () => {
    // The bonus cards here are uncommons, so a naive rarity pool would mix them
    // into the uncommon slot and inflate how often they appear.
    expect(set.pools.uncommon.every((c) => c.setCode === "tst")).toBe(true);
    expect(set.pools.bonus).toHaveLength(25);
  });

  it("deals the land slot at roughly its observed rate", () => {
    const rng = mulberry32(3);
    let withLand = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      if (makePack(set, rng).some(isBasicLand)) withLand++;
    }
    // Shapes above carry a land in 40% of packs.
    expect(withLand / runs).toBeGreaterThan(0.33);
    expect(withLand / runs).toBeLessThan(0.47);
  });

  it("is deterministic for a given seed", () => {
    const names = (seed: number) =>
      makePack(set, mulberry32(seed)).map((c) => c.name);
    expect(names(42)).toEqual(names(42));
  });

  it("never deals the same card twice in one pack", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const pack = makePack(set, rng);
      expect(new Set(pack.map((c) => c.name)).size).toBe(pack.length);
    }
  });
});

describe("weighted slots", () => {
  // A bonus sheet shaped like a real one: 5 cards carrying 10x the odds of the
  // other 20, the way SOS's Mystical Archive weights uncommons over mythics.
  function weightedBonusSet() {
    const set = fakePlayBoosterSet();
    const heavy = new Set(["B0", "B1", "B2", "B3", "B4"]);
    for (const c of set.cards) {
      if (c.setCode === "bns") c.packRate = heavy.has(c.name) ? 0.1 : 0.01;
      else c.packRate = 0.05;
    }
    return set;
  }

  const bonusDraws = (set: ReturnType<typeof weightedBonusSet>, runs: number) => {
    const rng = mulberry32(4);
    const hits = new Map<string, number>();
    for (let i = 0; i < runs; i++) {
      for (const c of makePack(set, rng)) {
        if (c.setCode === "bns") hits.set(c.name, (hits.get(c.name) ?? 0) + 1);
      }
    }
    return hits;
  };

  it("deals a card about as often as its observed rate says", () => {
    const runs = 40000;
    const hits = bonusDraws(weightedBonusSet(), runs);
    const total = [...hits.values()].reduce((a, b) => a + b, 0);

    // 5 cards at 0.1 and 20 at 0.01 -> the heavy five should take
    // 0.5 / (0.5 + 0.2) = ~71% of the slot between them.
    const heavyShare =
      ["B0", "B1", "B2", "B3", "B4"].reduce((n, k) => n + (hits.get(k) ?? 0), 0) / total;
    expect(heavyShare).toBeGreaterThan(0.66);
    expect(heavyShare).toBeLessThan(0.76);

    // Every card still reachable -- weighting must not silently strand the tail.
    expect(hits.size).toBe(25);
  });

  it("draws evenly when any card in the pool has no observed rate", () => {
    const set = weightedBonusSet();
    // One unmeasured card is enough: a partly-weighted pool would rank the
    // measured cards above the rest, which is worse than not weighting at all.
    delete set.pools.bonus.find((c) => c.name === "B7")!.packRate;

    const hits = bonusDraws(set, 40000);
    const total = [...hits.values()].reduce((a, b) => a + b, 0);
    const heavyShare =
      ["B0", "B1", "B2", "B3", "B4"].reduce((n, k) => n + (hits.get(k) ?? 0), 0) / total;

    // Uniform over 25 puts any five at 20%.
    expect(heavyShare).toBeGreaterThan(0.17);
    expect(heavyShare).toBeLessThan(0.23);
  });

  it("still deals the right pack size and no duplicates", () => {
    const set = weightedBonusSet();
    const rng = mulberry32(8);
    for (let i = 0; i < 500; i++) {
      const pack = makePack(set, rng);
      expect(pack).toHaveLength(14);
      expect(new Set(pack.map((c) => c.name)).size).toBe(14);
    }
  });

  it("is deterministic for a given seed", () => {
    const names = (seed: number) =>
      makePack(weightedBonusSet(), mulberry32(seed)).map((c) => c.name);
    expect(names(42)).toEqual(names(42));
  });
});

describe("sets without observed composition", () => {
  it("falls back to the fixed 15-card shape", () => {
    const set = fakeSet();
    expect(packSizeFor(set)).toBe(packSize());
    expect(makePack(set, mulberry32(1))).toHaveLength(15);
  });
});

describe("draft length follows pack size", () => {
  it("runs 42 picks for a 14-card set and 45 for a 15-card one", () => {
    expect(new DraftEngine(fakePlayBoosterSet(), mulberry32(1)).totalPicks()).toBe(
      PACK.packsPerDraft * 14,
    );
    expect(new DraftEngine(fakeSet(), mulberry32(1)).totalPicks()).toBe(
      PACK.packsPerDraft * 15,
    );
  });

  it("plays a full Play Booster draft to completion", () => {
    const engine = new DraftEngine(fakePlayBoosterSet(), mulberry32(9));
    while (!engine.isComplete()) engine.humanPick(engine.currentPack[0]);
    expect(engine.history).toHaveLength(42);
  });
});
