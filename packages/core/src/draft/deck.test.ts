import { describe, it, expect } from "vitest";
import { DECK } from "../config.js";
import { mkCard } from "../testing/fakeSet.js";
import { suggestDeck } from "./deck.js";
import type { Card, ColorWinRate } from "../model/card.js";

const spell = (name: string, color: "W" | "U" | "B", gih = 0.55): Card =>
  mkCard(name, "common", [color], gih);

const land = (name: string, overrides: Partial<Card> = {}): Card =>
  mkCard(name, "common", [], 0.52, { typeLine: "Land", ...overrides });

// A pool deep enough in W/U that the pair is never in doubt, so the tests are
// about the land split and not about which colors got chosen.
function pool(extra: Card[] = []): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < 15; i++) cards.push(spell(`W${i}`, "W", 0.58));
  for (let i = 0; i < 15; i++) cards.push(spell(`U${i}`, "U", 0.57));
  for (let i = 0; i < 10; i++) cards.push(spell(`B${i}`, "B", 0.5));
  return [...cards, ...extra];
}

// W and U each fill the deck on their own terms, and B holds three standouts
// and nothing else. Splashing them swaps three 0.58s for three 0.70s -- a raw
// gain of 0.36 over the whole deck, which the per-card width charge either does
// or does not cover. The crossover sits at 0.36/23 = 1.57pp, so the tables below
// are a comfortable way either side of it rather than a hair's breadth.
function splashablePool(): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < 12; i++) cards.push(spell(`W${i}`, "W", 0.58));
  for (let i = 0; i < 12; i++) cards.push(spell(`U${i}`, "U", 0.58));
  for (let i = 0; i < 3; i++) cards.push(spell(`B${i}`, "B", 0.7));
  return cards;
}

const archetypes = (rows: [string, number, number][]): ColorWinRate[] =>
  rows.map(([colors, n, wr]) => ({ colors, n, wr }));

// snc-shaped: three colors is what most of the field is doing and costs almost
// nothing.
const CHEAP_WIDTH = archetypes([
  ["WU", 20000, 0.6],
  ["WUB", 20000, 0.595],
]);

// fdn-shaped: three colors measures four points worse.
const EXPENSIVE_WIDTH = archetypes([
  ["WU", 20000, 0.6],
  ["WUB", 20000, 0.56],
]);

describe("suggestDeck", () => {
  it("builds a 40-card deck", () => {
    const deck = suggestDeck(pool());
    expect(deck.spells.length + deck.nonbasicLands.length + deck.basicLands).toBe(DECK.size);
    expect(deck.spells).toHaveLength(DECK.spellCount);
    expect(deck.basicLands).toBe(DECK.size - DECK.spellCount);
  });

  it("counts a drafted fixer as a land, not a spell", () => {
    const deck = suggestDeck(pool([land("Evolving Wilds")]));

    expect(deck.nonbasicLands.map((c) => c.name)).toContain("Evolving Wilds");
    expect(deck.spells.map((c) => c.name)).not.toContain("Evolving Wilds");
    expect(deck.spells).toHaveLength(DECK.spellCount);
    // The fixer displaces a basic rather than adding a 41st card.
    expect(deck.basicLands).toBe(DECK.size - DECK.spellCount - 1);
    expect(deck.spells.length + deck.nonbasicLands.length + deck.basicLands).toBe(DECK.size);
  });

  it("ignores drafted basics, which are free anyway", () => {
    const deck = suggestDeck(pool([land("Island", { typeLine: "Basic Land — Island" })]));

    expect(deck.nonbasicLands).toHaveLength(0);
    expect(deck.spells.map((c) => c.name)).not.toContain("Island");
    expect(deck.basicLands).toBe(DECK.size - DECK.spellCount);
  });

  it("takes only on-color nonbasic lands", () => {
    const deck = suggestDeck(
      pool([
        land("Sunlit Marsh", { colorIdentity: ["W", "U"] }),
        land("Cinder Barrens", { colorIdentity: ["B", "R"] }),
      ]),
    );

    expect(deck.colors.sort()).toEqual(["U", "W"]);
    expect(deck.nonbasicLands.map((c) => c.name)).toEqual(["Sunlit Marsh"]);
  });

  it("caps how many taplands displace basics", () => {
    const duals = Array.from({ length: 6 }, (_, i) =>
      land(`Dual${i}`, { colorIdentity: ["W", "U"] }),
    );
    const deck = suggestDeck(pool(duals));

    expect(deck.nonbasicLands).toHaveLength(DECK.maxNonbasicLands);
    expect(deck.spells.length + deck.nonbasicLands.length + deck.basicLands).toBe(DECK.size);
  });

  it("does not let a transforming creature count as a land", () => {
    const deck = suggestDeck(
      pool([mkCard("Werewolf", "common", ["W"], 0.6, { typeLine: "Creature — Human // Land" })]),
    );

    expect(deck.spells.map((c) => c.name)).toContain("Werewolf");
    expect(deck.nonbasicLands).toHaveLength(0);
  });

  it("splashes a third color where the format says it is cheap", () => {
    const deck = suggestDeck(splashablePool(), { archetypes: CHEAP_WIDTH });

    expect(deck.colors.sort()).toEqual(["B", "U", "W"]);
    expect(deck.spells.filter((c) => c.colors[0] === "B")).toHaveLength(3);
  });

  // Also what pins the charge to the card rather than the deck. Charged once,
  // 4pp would be a fraction of the 0.36 on offer and this pool would splash
  // under the expensive table too.
  it("stays on two colors where the format says the third is expensive", () => {
    const deck = suggestDeck(splashablePool(), { archetypes: EXPENSIVE_WIDTH });

    expect(deck.colors.sort()).toEqual(["U", "W"]);
    expect(deck.spells.every((c) => c.colors[0] !== "B")).toBe(true);
  });

  it("never widens without a table to price the widening with", () => {
    const deck = suggestDeck(splashablePool());

    expect(deck.colors).toHaveLength(2);
  });

  // Measurement trap #2, in the shape it takes here. Every archetype fixture
  // used to have contiguous widths; the real data has holes, and an unmeasured
  // width falls back to the format's own rate -- which the two-color decks
  // dominate, so the gap collapses and the third color reads as nearly free.
  describe("a format with a hole in its archetype widths", () => {
    const HOLE_AT_THREE = archetypes([
      ["WU", 20000, 0.6],
      ["WUBR", 300, 0.4],
    ]);

    it("does not offer a third color the format never measured", () => {
      const deck = suggestDeck(splashablePool(), { archetypes: HOLE_AT_THREE });

      expect(deck.colors.sort()).toEqual(["U", "W"]);
    });

    // The guard is about the hole, not about being narrow: fill it with a
    // cheap measured row and the same pool splashes.
    it("offers it again once the width is measured", () => {
      const filled = archetypes([
        ["WU", 20000, 0.6],
        ["WUB", 20000, 0.595],
        ["WUBR", 300, 0.4],
      ]);
      const deck = suggestDeck(splashablePool(), { archetypes: filled });

      expect(deck.colors.sort()).toEqual(["B", "U", "W"]);
    });
  });

  it("reports the curve it built, bucketed the way the chart is", () => {
    const cards: Card[] = [];
    for (let i = 0; i < 15; i++) cards.push(mkCard(`W${i}`, "common", ["W"], 0.58, { cmc: 2 }));
    for (let i = 0; i < 15; i++) cards.push(mkCard(`U${i}`, "common", ["U"], 0.57, { cmc: 9 }));
    const deck = suggestDeck(cards);

    expect(deck.curve.reduce((a, b) => a + b, 0)).toBe(deck.spells.length);
    // Every bucket present whether or not it holds anything, and everything
    // past six folded into it -- the nine-drops land in 6+, not off the end.
    expect(deck.curve).toEqual([0, 15, 0, 0, 0, 8]);
  });
});
