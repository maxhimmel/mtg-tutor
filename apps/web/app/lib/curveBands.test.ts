import { describe, expect, it } from "vitest";
import type { DisplayCard } from "@mtg-tutor/core";
import { colorBands, sayColumn } from "./curveBands";

const card = (name: string, colors: string[], typeLine = "Creature — Human"): DisplayCard =>
  ({
    name,
    colors,
    colorIdentity: colors,
    typeLine,
    manaCost: "{1}",
    cmc: 1,
    oracleText: "",
    collectorNumber: "1",
  }) as unknown as DisplayCard;

describe("colorBands", () => {
  it("counts a column by colour rather than by card", () => {
    const bands = colorBands([
      card("a", ["U"]),
      card("b", ["U"]),
      card("c", ["R"]),
    ]);
    expect(bands.map((b) => [b.key, b.count])).toEqual([
      ["U", 2],
      ["R", 1],
    ]);
  });

  // The whole point of the rewrite: shares of one bar sum to the bar, so no
  // band can be clipped off the end of it however full the pool gets.
  it("splits every card into exactly one band", () => {
    const cards = [
      ...Array.from({ length: 9 }, (_, i) => card(`w${i}`, ["W"])),
      ...Array.from({ length: 5 }, (_, i) => card(`u${i}`, ["U"])),
      card("gold", ["W", "U"]),
      card("rock", []),
    ];
    const bands = colorBands(cards);
    expect(bands.reduce((n, b) => n + b.count, 0)).toBe(cards.length);
  });

  it("orders mono colours WUBRG, then multicolour, then colourless", () => {
    const bands = colorBands([
      card("rock", []),
      card("g", ["G"]),
      card("gold", ["U", "B"]),
      card("w", ["W"]),
    ]);
    expect(bands.map((b) => b.key)).toEqual(["W", "G", "UB", ""]);
  });

  it("bands a land by its identity, not by its printed colours", () => {
    const [band] = colorBands([
      { ...card("Dual", []), colorIdentity: ["U", "B"], typeLine: "Land" } as DisplayCard,
    ]);
    expect(band.key).toBe("UB");
    expect(band.name).toBe("Blue/Black");
  });

  it("names a colourless card with the game's own word", () => {
    expect(colorBands([card("rock", [])])[0].name).toBe("Colorless");
  });
});

describe("sayColumn", () => {
  // Pips and not words, which is the whole contract: the tip is the surface a
  // reader is POINTING at a band to understand, and every other part of that
  // chart -- the band, the key's swatch, the axis -- is already the symbol.
  it("leads with the split in pips and follows with the names", () => {
    expect(sayColumn([card("Sailor", ["U"]), card("Sailor II", ["U"]), card("Bolt", ["R"])])).toBe(
      "2 {U}, 1 {R} — Sailor, Sailor II, Bolt",
    );
  });

  // A gold band is the case a bare letter could never say, and the one the key
  // draws as two pips.
  it("prints both halves of a gold band", () => {
    expect(sayColumn([card("Fire // Ice", ["U", "R"])])).toBe("1 {U}{R} — Fire // Ice");
  });

  it("says nothing about an empty column", () => {
    expect(sayColumn([])).toBe("");
  });
});
