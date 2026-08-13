import { describe, expect, it } from "vitest";
import { NO_NEEDS } from "../testing/fakeSet.js";
import type { CardContext, ColorCode, ColorWinRate } from "../model/card.js";
import { mkCard } from "../testing/fakeSet.js";
import {
  type ScoringContext,
  archDelta,
  archetypeWinRate,
  colorKey,
  commitment,
  contextValue,
  formatBaseline,
  splashCost,
} from "./context.js";

// Shaped like a real set's table: two-colour archetypes carry most of the games,
// three-colour a real minority, and the format sits well above 50%.
const ARCHETYPES: ColorWinRate[] = [
  { colors: "WU", n: 20000, wr: 0.6 },
  { colors: "WB", n: 20000, wr: 0.58 },
  { colors: "UB", n: 20000, wr: 0.59 },
  { colors: "WUB", n: 6000, wr: 0.55 },
  { colors: "WUBR", n: 1000, wr: 0.53 },
];

const card = (name: string, colors: ColorCode[], gih: number) =>
  mkCard(name, "common", colors, gih, { gihGames: 5000 });

const ctxOf = (over: Partial<ScoringContext> = {}): ScoringContext => ({
  colors: new Set<ColorCode>(["W", "U"]),
  commitment: 1,
  archetypes: ARCHETYPES,
  contextFor: () => undefined,
  needs: NO_NEEDS,
  ...over,
});

describe("colorKey", () => {
  it("is WUBRG order regardless of how the colours arrived", () => {
    expect(colorKey(["U", "W"])).toBe("WU");
    expect(colorKey(new Set<ColorCode>(["G", "B", "W"]))).toBe("WBG");
    expect(colorKey([])).toBe("");
  });
});

describe("formatBaseline", () => {
  it("is the population's own rate, not 0.5", () => {
    // 17Lands players beat the field; anything centred on 0.5 is ten points out
    // before it starts.
    expect(formatBaseline(ARCHETYPES)).toBeCloseTo(0.5855, 4);
  });

  it("weights by games, so a tiny archetype cannot drag it", () => {
    const withFringe = [...ARCHETYPES, { colors: "WUBRG", n: 50, wr: 0.2 }];
    expect(formatBaseline(withFringe)).toBeCloseTo(formatBaseline(ARCHETYPES), 3);
  });
});

describe("splashCost", () => {
  it("is zero at two colours or fewer, which is the reference", () => {
    expect(splashCost(ARCHETYPES, 1)).toBe(0);
    expect(splashCost(ARCHETYPES, 2)).toBe(0);
  });

  it("is the measured gap to the two-colour rate", () => {
    // 2c is 0.59 flat across 60k games; 3c is 0.55.
    expect(splashCost(ARCHETYPES, 3)).toBeCloseTo(0.04, 4);
    expect(splashCost(ARCHETYPES, 4)).toBeCloseTo(0.06, 4);
  });

  // The point of measuring rather than assuming: the same widening costs seven
  // times as much in one set as another, so no constant is right for both.
  it("differs per set, which is why it is not a constant", () => {
    const wedge: ColorWinRate[] = [
      { colors: "WU", n: 8000, wr: 0.594 },
      { colors: "WUB", n: 39000, wr: 0.582 },
    ];
    expect(splashCost(ARCHETYPES, 3)).toBeCloseTo(0.04, 3);
    expect(splashCost(wedge, 3)).toBeCloseTo(0.012, 3);
  });

  it("never pays you for narrowing", () => {
    const monoIsBest: ColorWinRate[] = [
      { colors: "W", n: 5000, wr: 0.7 },
      { colors: "WU", n: 5000, wr: 0.5 },
      { colors: "WUB", n: 5000, wr: 0.6 },
    ];
    expect(splashCost(monoIsBest, 3)).toBe(0);
  });
});

describe("archetypeWinRate", () => {
  it("uses the exact archetype when there is one", () => {
    expect(archetypeWinRate(ARCHETYPES, ["W", "U"])).toBe(0.6);
    expect(archetypeWinRate(ARCHETYPES, ["B", "U"])).toBe(0.59);
  });

  it("falls back to the mean at that width for an archetype nobody played", () => {
    expect(archetypeWinRate(ARCHETYPES, ["R", "G"])).toBeCloseTo(0.59, 4);
  });
});

describe("commitment", () => {
  const pool = [card("a", ["W"], 0.6), card("b", ["U"], 0.6), card("c", ["R"], 0.6)];
  const wu = new Set<ColorCode>(["W", "U"]);

  it("is zero at the first pick, so no direction can be implied", () => {
    expect(commitment(pool, wu, 0, 45)).toBe(0);
    expect(commitment([], wu, 10, 45)).toBe(0);
  });

  it("scales with how much of the draft has happened", () => {
    const early = commitment(pool, wu, 5, 45);
    const late = commitment(pool, wu, 40, 45);
    expect(late).toBeGreaterThan(early);
    // Two of three equal cards are on colour, 40 picks of 45 in.
    expect(late).toBeCloseTo((2 / 3) * (40 / 45), 4);
  });

  it("reads value share, not card count, so a bomb commits harder", () => {
    const bomb = [card("bomb", ["W"], 0.7), card("x", ["R"], 0.5), card("y", ["R"], 0.5)];
    const filler = [card("f", ["W"], 0.5), card("x", ["R"], 0.5), card("y", ["R"], 0.5)];
    expect(commitment(bomb, wu, 45, 45)).toBeGreaterThan(commitment(filler, wu, 45, 45));
  });

  it("does not let colourless cards dilute a colour they have no opinion on", () => {
    const withRock = [card("a", ["W"], 0.6), card("rock", [], 0.6)];
    expect(commitment(withRock, wu, 45, 45)).toBe(1);
  });
});

describe("archDelta", () => {
  const wu = card("Fits Here", ["W", "U"], 0.6);
  const withArch = (archWr: Record<string, number>): CardContext => ({ archWr });

  it("is zero when no archetype had enough games of the card", () => {
    expect(archDelta(ctxOf(), wu, undefined)).toBe(0);
    expect(archDelta(ctxOf(), wu, { archWr: { UB: 0.62 } })).toBe(0);
  });

  // The deconfound, and the reason it exists. A card at 0.60 overall sitting at
  // 0.60 inside WU has told you nothing: WU itself runs at 0.60.
  it("is zero for a card that is exactly as good here as everywhere", () => {
    const overall = 0.6;
    const archetypeIsBetterBy = 0.6 - formatBaseline(ARCHETYPES);
    const noSignal = overall + archetypeIsBetterBy;
    expect(archDelta(ctxOf(), wu, withArch({ WU: noSignal }))).toBeCloseTo(0, 10);
  });

  it("is positive for a card that outperforms its own standing here", () => {
    expect(archDelta(ctxOf(), wu, withArch({ WU: 0.66 }))).toBeGreaterThan(0);
  });

  // Without this, a three-colour archetype's own lower rate would read as the
  // card being bad in it, and splashCost would charge for the same thing again.
  it("does not blame a card for the archetype it is measured in", () => {
    const wide = ctxOf({ colors: new Set<ColorCode>(["W", "U", "B"]) });
    const inWide = archDelta(wide, wu, withArch({ WUB: 0.55 }));
    const inPair = archDelta(ctxOf(), wu, withArch({ WU: 0.6 }));
    expect(inWide).toBeCloseTo(inPair, 10);
  });
});

describe("contextValue", () => {
  const wu = card("On Colour", ["W", "U"], 0.6);

  it("is the card alone when nothing is known and nothing is committed", () => {
    const out = contextValue(wu, ctxOf({ commitment: 0 }));
    expect(out.value).toBeCloseTo(out.base, 10);
    expect(out.terms).toEqual([]);
  });

  it("charges a third colour what the set says it costs", () => {
    const splashy = card("Off Colour", ["B"], 0.6);
    const out = contextValue(splashy, ctxOf());
    const splash = out.terms.find((t) => t.label === "splash");
    expect(splash?.delta).toBeCloseTo(-0.04, 4);
  });

  it("charges nothing to stay inside the colours already committed", () => {
    expect(contextValue(wu, ctxOf()).terms.find((t) => t.label === "splash")).toBeUndefined();
  });

  it("scales the pool-dependent terms by commitment, and leaves the card alone", () => {
    const splashy = card("Off Colour", ["B"], 0.6);
    const half = contextValue(splashy, ctxOf({ commitment: 0.5 }));
    const full = contextValue(splashy, ctxOf({ commitment: 1 }));
    const at = (o: typeof half, l: string) => o.terms.find((t) => t.label === l)?.delta ?? 0;
    expect(at(half, "splash")).toBeCloseTo(at(full, "splash") / 2, 10);
  });

  it("distrusts a card that is taken and then not played", () => {
    const trap = card("Trap", ["W"], 0.62);
    const out = contextValue(trap, ctxOf({ contextFor: () => ({ maindeckRate: 0.2 }) }));
    const trust = out.terms.find((t) => t.label === "trust");
    // Shrunk toward the baseline, which is below this card's rate -- so down.
    expect(trust?.delta).toBeLessThan(0);
    expect(out.value).toBeGreaterThan(formatBaseline(ARCHETYPES));
  });

  // Self-selection flatters in one direction only. Promoting a weak card
  // nobody plays would read "not being played is evidence it is better than it
  // looks", which is backwards -- and the backtest caught exactly that.
  it("never promotes a weak card just because nobody plays it", () => {
    const weak = card("Weak Trap", ["W"], 0.5);
    const out = contextValue(weak, ctxOf({ contextFor: () => ({ maindeckRate: 0.01 }) }));
    expect(out.value).toBe(out.base);
    expect(out.terms).toEqual([]);
  });

  it("does not distrust a card people actually play", () => {
    const out = contextValue(wu, ctxOf({ contextFor: () => ({ maindeckRate: 0.9 }) }));
    expect(out.terms.find((t) => t.label === "trust")).toBeUndefined();
  });

  it("does not score IWD, which is stored but has no defensible weight", () => {
    const out = contextValue(wu, ctxOf({ contextFor: () => ({ iwd: 0.04 }) }));
    expect(out.terms).toEqual([]);
  });

  it("reports its terms largest-first, and they sum to the difference", () => {
    const splashy = card("Off Colour", ["B"], 0.62);
    const out = contextValue(
      splashy,
      ctxOf({ contextFor: () => ({ archWr: { WU: 0.68 }, maindeckRate: 0.3 }) }),
    );
    const sizes = out.terms.map((t) => Math.abs(t.delta));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    expect(out.terms.reduce((a, t) => a + t.delta, 0)).toBeCloseTo(out.value - out.base, 10);
  });
});

describe("splashCost is monotone in width", () => {
  // fdn's shape: nothing at four colours, so the width falls back to the
  // format's own rate -- which is higher than the measured three-colour rate.
  const gappy: ColorWinRate[] = [
    { colors: "WU", n: 20000, wr: 0.6 },
    { colors: "WUB", n: 5000, wr: 0.53 },
  ];

  it("never makes a wider deck cheaper than a narrower one", () => {
    for (let w = 3; w <= 5; w++) {
      expect(splashCost(gappy, w)).toBeGreaterThanOrEqual(splashCost(gappy, w - 1));
    }
  });

  // The bug this is for: a stored pick was credited +1.5pp for adding a colour,
  // because the unmeasured width fell back to a rate above the measured one.
  it("never pays a card for widening the deck", () => {
    const ctx = ctxOf({ colors: new Set<ColorCode>(["W", "U", "B"]), archetypes: gappy });
    const fourth = card("Fourth Colour", ["R"], 0.6);
    const splash = contextValue(fourth, ctx).terms.find((t) => t.label === "splash");
    expect(splash?.delta ?? 0).toBeLessThanOrEqual(0);
  });
});
