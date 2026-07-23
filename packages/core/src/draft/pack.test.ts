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
