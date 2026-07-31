import { describe, it, expect } from "vitest";
import { CURVE_TOP, manaCurve, parseManaCost } from "./mana.js";

describe("parseManaCost", () => {
  it("splits a plain cost", () => {
    expect(parseManaCost("{2}{U}{U}")).toEqual(["2", "U", "U"]);
  });

  it("keeps compound symbols whole", () => {
    expect(parseManaCost("{W/U}{2/R}{G/P}{X}")).toEqual(["W/U", "2/R", "G/P", "X"]);
  });

  it("flattens a split card's two halves", () => {
    expect(parseManaCost("{1}{U} // {3}{U}")).toEqual(["1", "U", "3", "U"]);
  });

  it("is empty for a land or a missing cost", () => {
    expect(parseManaCost("")).toEqual([]);
    expect(parseManaCost(undefined)).toEqual([]);
  });
});

describe("manaCurve", () => {
  const card = (cmc: number, typeLine = "Creature — Human") => ({ cmc, typeLine });
  const counts = (cards: { cmc: number; typeLine: string }[]) =>
    manaCurve(cards).map((b) => b.cards.length);

  it("keeps every bucket, so the axis holds still while the pool grows", () => {
    expect(manaCurve([]).map((b) => b.label)).toEqual(["1", "2", "3", "4", "5", "6+"]);
    expect(counts([])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("buckets a card by the turn it comes down on", () => {
    expect(counts([card(1), card(2), card(2), card(5)])).toEqual([1, 2, 0, 0, 1, 0]);
  });

  it("puts a free spell on turn one and everything expensive in the top bucket", () => {
    expect(counts([card(0), card(CURVE_TOP), card(9)])).toEqual([1, 0, 0, 0, 0, 2]);
  });

  it("leaves lands out — they pay for the curve rather than sit on it", () => {
    expect(counts([card(0, "Land"), card(2, "Artifact Land"), card(2)])).toEqual([
      0, 1, 0, 0, 0, 0,
    ]);
  });

  it("counts a transforming land-back creature as the spell you cast", () => {
    expect(counts([card(3, "Creature — Elf // Land")])).toEqual([0, 0, 1, 0, 0, 0]);
  });
});
