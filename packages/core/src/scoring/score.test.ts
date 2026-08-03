import { describe, it, expect } from "vitest";
import type { Card, ColorCode, IngestCard } from "../model/card.js";
import type { ScoringContext } from "./context.js";
import { scorePick, gradeFor, committedColors, isDecisionPick, isCorrectGuess } from "./score.js";
import { computeCardValue } from "./value.js";

// Settles `value` the way ingest does, so a fixture reads the number its stats
// imply rather than one written by hand beside them.
// Returns a card that definitely knows its rarity, so it can be handed to
// computeCardValue -- the same distinction IngestCard draws for the pipeline.
function card(name: string, over: Partial<Card> = {}): IngestCard & { value: number } {
  const base: IngestCard = {
    name,
    rarity: "common",
    colors: [],
    colorIdentity: [],
    manaCost: "",
    cmc: 1,
    typeLine: "Creature",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.5,
    gihGames: 5000,
    alsa: 8,
    ...over,
  };
  return { ...base, value: over.value ?? computeCardValue(base) };
}

// These read computeCardValue directly now. `cardValue` returns the stored
// answer and nothing else, so asking it about a formula would only be asking
// this factory what it just wrote.
describe("computeCardValue", () => {
  it("uses GIH WR when sample is large", () => {
    expect(computeCardValue(card("a", { gihWinRate: 0.6, gihGames: 5000 }))).toBe(0.6);
  });
  it("falls back to rarity baseline when no data", () => {
    const v = computeCardValue(card("b", { gihWinRate: undefined, gihGames: 0, alsa: undefined, rarity: "rare" }));
    expect(v).toBeCloseTo(0.55, 2);
  });
  it("never returns NaN", () => {
    expect(Number.isNaN(computeCardValue(card("c", { gihWinRate: undefined, gihGames: undefined, alsa: undefined })))).toBe(false);
  });
});

describe("scorePick", () => {
  const strong = card("Strong", { gihWinRate: 0.6, gihGames: 5000 });
  const weak = card("Weak", { gihWinRate: 0.5, gihGames: 5000 });

  it("gives 100 for taking the best card", () => {
    const r = scorePick([strong, weak], strong, []);
    expect(r.score).toBe(100);
    expect(r.isBest).toBe(true);
    expect(r.rankInPack).toBe(1);
  });

  it("penalizes a large win-rate gap", () => {
    const r = scorePick([strong, weak], weak, []);
    expect(r.score).toBeLessThan(50);
    expect(r.isBest).toBe(false);
    expect(r.rankInPack).toBe(2);
  });

  it("is never off-color before any colors are committed (P1P1)", () => {
    const red = card("Red Thing", { colors: ["R"], gihWinRate: 0.5, gihGames: 5000 });
    const r = scorePick([strong, red], red, []);
    expect(r.onColor).toBe(true);
  });

  it("gives on-color partial credit within committed colors", () => {
    const pool = [card("p1", { colors: ["U"] }), card("p2", { colors: ["U"] })];
    const offBest = card("OffBest", { colors: ["R"], gihWinRate: 0.58, gihGames: 5000 });
    const onWeak = card("OnWeak", { colors: ["U"], gihWinRate: 0.55, gihGames: 5000 });
    const off = scorePick([offBest, onWeak], onWeak, pool);
    expect(off.onColor).toBe(true);
    expect(off.score).toBeGreaterThan(scorePick([offBest, onWeak], onWeak, []).score);
  });
});

describe("gradeFor", () => {
  it("maps score ranges to letters", () => {
    expect(gradeFor(100)).toBe("A+");
    expect(gradeFor(78)).toBe("B");
    expect(gradeFor(10)).toBe("F");
  });
});

describe("isDecisionPick", () => {
  it("is a decision when the pack still has enough cards", () => {
    expect(isDecisionPick(8, 5)).toBe(true);
    expect(isDecisionPick(5, 5)).toBe(true);
  });
  it("is trivial once the pack is picked down past the threshold", () => {
    expect(isDecisionPick(4, 5)).toBe(false);
    expect(isDecisionPick(1, 5)).toBe(false);
  });
  it("coaches every pick at the floor the force button sends", () => {
    expect(isDecisionPick(1, 1)).toBe(true);
  });
});

describe("isCorrectGuess", () => {
  it("accepts the raw-power best", () => {
    expect(isCorrectGuess("Raw", "Raw", "Context")).toBe(true);
  });
  it("accepts the context best (lenient)", () => {
    expect(isCorrectGuess("Context", "Raw", "Context")).toBe(true);
  });
  it("rejects a card that is neither", () => {
    expect(isCorrectGuess("Other", "Raw", "Context")).toBe(false);
  });
});

describe("committedColors", () => {
  it("commits to colors with 2+ cards", () => {
    const pool = [card("a", { colors: ["W"] }), card("b", { colors: ["W"] }), card("c", { colors: ["R"] })];
    const committed = committedColors(pool);
    expect(committed.has("W")).toBe(true);
    expect(committed.has("R")).toBe(false);
  });
});

describe("scorePick with a scoring context", () => {
  const strong = card("Strong", { gihWinRate: 0.6, gihGames: 5000, colors: ["R"] });
  const weak = card("Weak", { gihWinRate: 0.55, gihGames: 5000, colors: ["W"] });
  const pack = [strong, weak];

  // A context in which the weaker card is what the deck actually wants: it is
  // on-colour, and the strong one would drag the deck to a third colour that
  // this set punishes.
  const ctx: ScoringContext = {
    colors: new Set<ColorCode>(["W", "U"]),
    commitment: 1,
    archetypes: [
      { colors: "WU", n: 20000, wr: 0.6 },
      { colors: "WUR", n: 4000, wr: 0.5 },
    ],
    contextFor: () => undefined,
  };

  it("answers rawBest when it is given no context, rather than guessing", () => {
    const out = scorePick(pack, weak, []);
    expect(out.rawBest.name).toBe("Strong");
    expect(out.contextBest.name).toBe("Strong");
    expect(out.contextBestValue).toBe(out.rawBestValue);
  });

  it("names a different context-best when the deck disagrees with the data", () => {
    const out = scorePick(pack, weak, [], ctx);
    expect(out.rawBest.name).toBe("Strong");
    expect(out.contextBest.name).toBe("Weak");
  });

  // The point of this step: the shape widened and not one score moved. The
  // grade flip is its own change so it can be reverted on its own.
  it("does not change the score, the grade or isBest", () => {
    const without = scorePick(pack, weak, []);
    const with_ = scorePick(pack, weak, [], ctx);
    expect(with_.score).toBe(without.score);
    expect(with_.grade).toBe(without.grade);
    expect(with_.isBest).toBe(without.isBest);
    expect(with_.rankInPack).toBe(without.rankInPack);
  });
});
