import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import { scorePick, gradeFor, committedColors } from "./score.js";
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

describe("committedColors", () => {
  it("commits to colors with 2+ cards", () => {
    const pool = [card("a", { colors: ["W"] }), card("b", { colors: ["W"] }), card("c", { colors: ["R"] })];
    const committed = committedColors(pool);
    expect(committed.has("W")).toBe(true);
    expect(committed.has("R")).toBe(false);
  });
});
