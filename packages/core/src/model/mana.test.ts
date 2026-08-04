import { describe, it, expect } from "vitest";
import { CURVE_TOP, castingValue, manaCurve, parseManaCost } from "./mana.js";

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

describe("castingValue", () => {
  it("is the mana value for an ordinary card", () => {
    expect(castingValue({ cmc: 3, manaCost: "{2}{U}" })).toBe(3);
    expect(castingValue({ cmc: 3 })).toBe(3);
  });

  // Dazzling Theater // Prop Room, whose 7 nobody has ever paid.
  it("is the cheaper half of a split card, not the sum Scryfall reports", () => {
    expect(castingValue({ cmc: 7, manaCost: "{3}{W} // {2}{W}" })).toBe(3);
  });

  // An adventure's mana value is already its front face's, so the printed cost
  // does not account for it and must not be read as two halves to choose from.
  it("leaves an adventure alone, whichever way its cost is printed", () => {
    expect(castingValue({ cmc: 2, manaCost: "{1}{U}" })).toBe(2);
    expect(castingValue({ cmc: 2, manaCost: "{1}{U} // {2}{U}" })).toBe(2);
  });

  it("reads X as nothing and a hybrid as the most it can cost", () => {
    expect(castingValue({ cmc: 4, manaCost: "{X}{R} // {2}{R}" })).toBe(1);
    expect(castingValue({ cmc: 5, manaCost: "{2/W}{W} // {1}{W}" })).toBe(2);
  });
});

describe("manaCurve", () => {
  const card = (cmc: number, typeLine = "Creature — Human") => ({ cmc, typeLine });
  const counts = (cards: { cmc: number; typeLine: string; manaCost?: string }[]) =>
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

  // A split card's mana value is the sum of its halves, so bucketing on it put
  // every one of them among the seven-drops -- a shape no Limited deck has.
  it("buckets a split card on the half you would actually cast", () => {
    expect(
      counts([
        { cmc: 7, typeLine: "Sorcery // Sorcery", manaCost: "{3}{W} // {2}{W}" },
      ]),
    ).toEqual([0, 0, 1, 0, 0, 0]);
  });
});
