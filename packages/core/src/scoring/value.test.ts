import { describe, expect, it } from "vitest";
import { cardValue, observedRarityBaselines } from "./value.js";
import { overallWinRate } from "../data/mapping.js";
import { mkCard } from "../testing/fakeSet.js";
import { RARITY_BASELINE, SCORING } from "../config.js";
import type { Card } from "../model/card.js";
import type { ColorRating } from "../data/sources.js";

const N = SCORING.minSampleForWinRate;
const rated = (rarity: Card["rarity"], gih: number) =>
  mkCard(`${rarity}-${gih}`, rarity, ["U"], gih, { gihGames: N });

describe("observedRarityBaselines", () => {
  // A set whose rated win rates sit near 0.60, far from the 0.51-0.57 constants.
  const cards: Card[] = [
    ...Array.from({ length: 6 }, (_, i) => rated("common", 0.58 + i * 0.01)),
    ...Array.from({ length: 6 }, (_, i) => rated("rare", 0.61 + i * 0.01)),
  ];

  it("measures a rarity's baseline from its own rated cards", () => {
    const b = observedRarityBaselines(cards);
    expect(b.get("common")).toBeCloseTo(0.605, 3); // median of 0.58..0.63
    expect(b.get("rare")).toBeCloseTo(0.635, 3);
  });

  it("lands far above the hardcoded constant, on the format's real scale", () => {
    const b = observedRarityBaselines(cards);
    expect(b.get("common")).toBeGreaterThan(RARITY_BASELINE.common + 0.05);
  });

  it("falls back to the set's overall median for a thin rarity", () => {
    const b = observedRarityBaselines(cards); // no mythics rated
    // 12 rated cards spanning 0.58..0.66; the even-count median averages the two
    // middle values (0.61 and 0.63).
    expect(b.get("mythic")).toBeCloseTo(0.62, 6);
    expect(b.get("mythic")).toBe(b.get("mythic")); // same fallback for every thin rarity
    expect(b.get("uncommon")).toBeCloseTo(0.62, 6);
  });

  it("returns nothing for a set with no rated cards", () => {
    expect(observedRarityBaselines([mkCard("x", "common", ["U"], undefined as never)]).size).toBe(0);
  });

  it("ignores cards below the sample floor", () => {
    const thin = mkCard("thin", "common", ["U"], 0.9, { gihGames: N - 1 });
    expect(observedRarityBaselines([thin]).size).toBe(0);
  });
});

describe("cardValue with a measured baseline", () => {
  it("scores an unrated card at its rarity's observed baseline, not the constant", () => {
    const card = mkCard("U1", "rare", ["U"], undefined as never, {
      rarityBaseline: 0.62,
      alsa: 8,
    });
    expect(cardValue(card)).toBeCloseTo(0.62, 6);
  });

  it("stops an unrated rare from scoring below every rated card", () => {
    // The bug this fixes: a rated card near the population mean outscored an
    // unrated rare, because the rare fell back to the 0.55 constant.
    const ratedAverage = rated("common", 0.595);
    const unratedRare = mkCard("R?", "rare", ["U"], undefined as never, {
      rarityBaseline: 0.62,
      alsa: 8,
    });
    expect(cardValue(unratedRare)).toBeGreaterThan(cardValue(ratedAverage));
  });

  it("falls back to RARITY_BASELINE when a card carries no measured baseline", () => {
    const legacy = mkCard("old", "uncommon", ["U"], undefined as never, { alsa: 8 });
    expect(cardValue(legacy)).toBeCloseTo(RARITY_BASELINE.uncommon, 6);
  });

  it("uses a trustworthy win rate directly, ignoring the baseline", () => {
    expect(cardValue(rated("common", 0.63))).toBeCloseTo(0.63, 6);
  });

  it("blends toward the measured baseline on a thin sample", () => {
    const card = mkCard("T", "rare", ["U"], 0.9, {
      gihGames: N / 2,
      rarityBaseline: 0.62,
      alsa: 8,
    });
    expect(cardValue(card)).toBeCloseTo(0.9 * 0.5 + 0.62 * 0.5, 6);
  });
});

describe("overallWinRate", () => {
  const cr = (name: string, wins: number, games: number, is_summary = false): ColorRating => ({
    is_summary,
    color_name: name,
    short_name: name,
    wins,
    games,
  });

  it("ignores summary rows, which double-count every game", () => {
    const ratings = [cr("WU", 60, 100), cr("BR", 40, 100), cr("Two-color", 100, 200, true)];
    expect(overallWinRate(ratings)).toBeCloseTo(0.5, 6);
  });

  it("is undefined when there is nothing to measure", () => {
    expect(overallWinRate([])).toBeUndefined();
    expect(overallWinRate([cr("WU", 0, 0)])).toBeUndefined();
  });
});
