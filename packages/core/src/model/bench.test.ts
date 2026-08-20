import { describe, expect, it } from "vitest";
import {
  applyBench,
  benchChanges,
  benchedAsOf,
  benchedOnArrival,
  normalizeBench,
  splitPool,
  type Bench,
} from "./bench.js";

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

describe("applyBench", () => {
  it("sets a position aside with the clock it was set aside at", () => {
    expect(applyBench([], 4, true, 12)).toEqual([{ pos: 4, atPick: 12 }]);
  });

  it("takes a position back", () => {
    const bench: Bench[] = [
      { pos: 1, atPick: 1 },
      { pos: 4, atPick: 12 },
    ];
    expect(applyBench(bench, 4, false, 30)).toEqual([{ pos: 1, atPick: 1 }]);
  });

  // The whole reason this is not a toggle: a client that predicts the answer
  // must predict the stored one, and re-benching keeps the original clock.
  it("keeps the original clock when the same card is benched twice", () => {
    const bench: Bench[] = [{ pos: 4, atPick: 12 }];
    expect(applyBench(bench, 4, true, 40)).toEqual(bench);
  });

  it("takes back a position that was never set aside without inventing one", () => {
    expect(applyBench([{ pos: 1, atPick: 1 }], 4, false, 12)).toEqual([{ pos: 1, atPick: 1 }]);
  });

  it("keeps the bench in pool order", () => {
    const bench = applyBench(applyBench([], 7, true, 7), 2, true, 9);
    expect(bench.map((b) => b.pos)).toEqual([2, 7]);
  });

  it("does not touch the bench it was handed", () => {
    const bench: Bench[] = [{ pos: 1, atPick: 1 }];
    applyBench(bench, 4, true, 12);
    expect(bench).toEqual([{ pos: 1, atPick: 1 }]);
  });
});

describe("benchChanges", () => {
  it("names only the positions that moved, and which way", () => {
    const before: Bench[] = [
      { pos: 1, atPick: 1 },
      { pos: 4, atPick: 4 },
    ];
    const after: Bench[] = [
      { pos: 4, atPick: 4 },
      { pos: 9, atPick: 40 },
    ];
    expect(benchChanges(before, after)).toEqual([
      { pos: 1, benched: false },
      { pos: 9, benched: true },
    ]);
  });

  it("finds nothing to write when nothing moved", () => {
    const bench: Bench[] = [{ pos: 3, atPick: 3 }];
    expect(benchChanges(bench, bench)).toEqual([]);
  });

  // A re-read of the same split can carry a different clock -- the server keeps
  // the original where an optimistic client guessed at one. Which pile a card is
  // in is the only thing that needs writing back.
  it("ignores a clock that moved without the card", () => {
    expect(benchChanges([{ pos: 3, atPick: 40 }], [{ pos: 3, atPick: 3 }])).toEqual([]);
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

// notes.md #13. The rule the file header has described since it was written,
// with nothing reading it until the coach needed to stop lecturing people about
// a card they had already put away.
describe("benchedOnArrival", () => {
  it("is true when the card was set aside at the pick that took it", () => {
    expect(benchedOnArrival([{ pos: 7, atPick: 7 }], 7)).toBe(true);
  });

  it("is false when it was picked to play and benched later", () => {
    // The distinction the whole `atPick` clock exists for: deciding at pick 30
    // that something is unplayable is not evidence about the pick at 7.
    expect(benchedOnArrival([{ pos: 7, atPick: 30 }], 7)).toBe(false);
  });

  it("is false for a different card benched at this pick", () => {
    expect(benchedOnArrival([{ pos: 2, atPick: 7 }], 7)).toBe(false);
  });

  it("is false when nothing is benched at all", () => {
    expect(benchedOnArrival([], 7)).toBe(false);
  });

  // A legacy bench is a bare position, and `normalizeBench` reads it as
  // `atPick = pos` on purpose. This asserts the consequence rather than leaving
  // it to be rediscovered: those rows all answer true.
  it("reads a legacy positional bench as benched on arrival", () => {
    expect(benchedOnArrival(normalizeBench([4]), 4)).toBe(true);
  });
});
