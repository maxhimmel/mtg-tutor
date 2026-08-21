import { describe, expect, it } from "vitest";
import { tableValueShift, tableValues } from "./tableValue.js";

const card = (name: string, value: number, alsa?: number) => ({ name, value, alsa });

describe("tableValues", () => {
  it("hands the same values back out in the table's order", () => {
    const cards = [
      card("wins most, taken late", 0.70, 6.0),
      card("wins least, taken first", 0.55, 0.5),
      card("middle", 0.62, 3.0),
    ];
    const out = tableValues(cards);

    // The multiset is preserved exactly -- only who holds which number changed.
    expect([...out.values()].sort()).toEqual([0.55, 0.62, 0.7]);
    expect(out.get("wins least, taken first")).toBe(0.7);
    expect(out.get("middle")).toBe(0.62);
    expect(out.get("wins most, taken late")).toBe(0.55);
  });

  it("says nothing at all about a card with no pick order", () => {
    const cards = [card("rated", 0.60, 2.0), card("never opened", 0.51)];
    const out = tableValues(cards);
    // Absent, not equal-to-value: a stored `tableValue` that was always present
    // would read the same whether 17Lands had no pick order for the card or the
    // two orderings simply agreed, which are not the same fact.
    expect(out.has("never opened")).toBe(false);
    // And the rated card keeps the only value in the ordered spread, which is
    // its own -- an unrated card must not donate its number to the pool.
    expect(out.get("rated")).toBe(0.6);
  });

  it("is identity when win rate already ranks like the table", () => {
    const cards = [card("a", 0.7, 1), card("b", 0.6, 2), card("c", 0.5, 3)];
    const out = tableValues(cards);
    for (const c of cards) expect(out.get(c.name)).toBe(c.value);
  });

  it("survives a set with nothing rated", () => {
    expect([...tableValues([card("a", 0.7), card("b", 0.6)]).entries()]).toEqual([]);
  });
});

describe("tableValueShift", () => {
  it("reports a perfect agreement as no movement", () => {
    const cards = [card("a", 0.7, 1), card("b", 0.6, 2), card("c", 0.5, 3)];
    expect(tableValueShift(cards)).toEqual({ moved: 0, spearman: 1 });
  });

  it("reports a reversal", () => {
    const cards = [card("a", 0.7, 3), card("b", 0.6, 2), card("c", 0.5, 1)];
    expect(tableValueShift(cards).spearman).toBe(-1);
  });
});
