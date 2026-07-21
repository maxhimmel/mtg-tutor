import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import { scorePick, gradeFor, committedColors, isDecisionPick, isCorrectGuess } from "./score.js";
import { cardValue } from "./value.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
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
}

describe("cardValue", () => {
  it("uses GIH WR when sample is large", () => {
    expect(cardValue(card("a", { gihWinRate: 0.6, gihGames: 5000 }))).toBe(0.6);
  });
  it("falls back to rarity baseline when no data", () => {
    const v = cardValue(card("b", { gihWinRate: undefined, gihGames: 0, alsa: undefined, rarity: "rare" }));
    expect(v).toBeCloseTo(0.55, 2);
  });
  it("never returns NaN", () => {
    expect(Number.isNaN(cardValue(card("c", { gihWinRate: undefined, gihGames: undefined, alsa: undefined })))).toBe(false);
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
  const pack = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i}`));
  it("is a decision when the pack still has enough cards", () => {
    expect(isDecisionPick(pack(8), 5)).toBe(true);
    expect(isDecisionPick(pack(5), 5)).toBe(true);
  });
  it("is trivial once the pack is picked down past the threshold", () => {
    expect(isDecisionPick(pack(4), 5)).toBe(false);
    expect(isDecisionPick(pack(1), 5)).toBe(false);
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
