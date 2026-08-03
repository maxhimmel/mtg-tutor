import { describe, expect, it } from "vitest";
import { type Bench, benchedAsOf, normalizeBench, splitPool } from "./bench.js";

const pool = (n: number) => Array.from({ length: n }, (_, i) => `card${i}`);

describe("normalizeBench", () => {
  it("reads a legacy position as benched from the moment it was drafted", () => {
    expect(normalizeBench([3, 7])).toEqual([
      { pos: 3, atPick: 3 },
      { pos: 7, atPick: 7 },
    ]);
  });

  it("leaves entries that already carry a clock alone", () => {
    const bench: Bench[] = [{ pos: 3, atPick: 22 }];
    expect(normalizeBench(bench)).toEqual(bench);
  });

  // The reason `atPick = pos` is the right backfill: before the clock existed a
  // bench applied to every pick that could see the card, and this reproduces
  // that for every pick, not just most of them.
  it("makes a legacy bench apply to every pick that can see it", () => {
    const bench = normalizeBench([2]);
    for (let n = 3; n <= 45; n++) {
      expect(splitPool(pool(n), bench, n).maindeck).not.toContain("card2");
    }
  });
});

describe("benchedAsOf", () => {
  const bench: Bench[] = [
    { pos: 1, atPick: 1 },
    { pos: 4, atPick: 20 },
  ];

  it("counts a bench from the pick it happened at", () => {
    expect(benchedAsOf(bench, 19)).toEqual(new Set([1]));
    expect(benchedAsOf(bench, 20)).toEqual(new Set([1, 4]));
  });

  it("is empty before anything was set aside", () => {
    expect(benchedAsOf(bench, 0)).toEqual(new Set());
  });
});

describe("splitPool", () => {
  it("keeps a late bench out of an early pick", () => {
    const bench: Bench[] = [{ pos: 2, atPick: 40 }];
    expect(splitPool(pool(5), bench, 5).maindeck).toContain("card2");
    expect(splitPool(pool(41), bench, 41).maindeck).not.toContain("card2");
  });

  it("never counts a card that was picked straight to the sideboard", () => {
    const bench: Bench[] = [{ pos: 2, atPick: 2 }];
    expect(splitPool(pool(3), bench, 3).maindeck).toEqual(["card0", "card1"]);
    expect(splitPool(pool(3), bench, 3).sideboard).toEqual(["card2"]);
  });

  it("ignores a bench past the end of this pick's pool", () => {
    const bench: Bench[] = [{ pos: 9, atPick: 9 }];
    expect(splitPool(pool(3), bench, 3)).toEqual({
      maindeck: ["card0", "card1", "card2"],
      sideboard: [],
    });
  });

  it("splits into two halves that account for the whole pool", () => {
    const bench: Bench[] = [
      { pos: 0, atPick: 0 },
      { pos: 3, atPick: 6 },
    ];
    const { maindeck, sideboard } = splitPool(pool(8), bench, 8);
    expect(sideboard).toEqual(["card0", "card3"]);
    expect(maindeck.length + sideboard.length).toBe(8);
  });
});
