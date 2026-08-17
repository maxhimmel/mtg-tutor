import { describe, it, expect } from "vitest";
import { DECK } from "../config.js";
import { mkCard } from "../testing/fakeSet.js";
import { colorPips, landsFor, suggestDeck } from "./deck.js";
import type { Card, ColorWinRate } from "../model/card.js";

const spell = (name: string, color: "W" | "U" | "B", gih = 0.55): Card =>
  mkCard(name, "common", [color], gih);

// A land's `colors` is its colour identity, because that is what `requiredColors`
// settles at ingest -- a land has no mana cost, so anything else here would be a
// card the pipeline cannot produce, and the fixture would be testing nothing.
const land = (name: string, overrides: Partial<Card> = {}): Card => {
  const card = mkCard(name, "common", [], 0.52, { typeLine: "Land", ...overrides });
  return { ...card, colors: overrides.colors ?? card.colorIdentity };
};

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
  // The pool is all two-drops, so DECK-04's condition -- four or more cards at
  // five-plus -- is not met and the deck correctly wants 16 lands and 24 spells.
  // That is the rule working, not the deck being one card wrong: `DECK.spellCount`
  // is the convention this now varies from on purpose.
  const LOW_CURVE_SPELLS = 24;

  it("builds a 40-card deck", () => {
    const deck = suggestDeck(pool());
    expect(deck.spells.length + deck.nonbasicLands.length + deck.basicLands).toBe(DECK.size);
    expect(deck.spells).toHaveLength(LOW_CURVE_SPELLS);
    expect(deck.basicLands).toBe(DECK.size - LOW_CURVE_SPELLS);
  });

  it("counts a drafted fixer as a land, not a spell", () => {
    const deck = suggestDeck(pool([land("Evolving Wilds")]));

    expect(deck.nonbasicLands.map((c) => c.name)).toContain("Evolving Wilds");
    expect(deck.spells.map((c) => c.name)).not.toContain("Evolving Wilds");
    expect(deck.spells).toHaveLength(LOW_CURVE_SPELLS);
    // The fixer displaces a basic rather than adding a 41st card.
    expect(deck.basicLands).toBe(DECK.size - LOW_CURVE_SPELLS - 1);
    expect(deck.spells.length + deck.nonbasicLands.length + deck.basicLands).toBe(DECK.size);
  });

  it("ignores drafted basics, which are free anyway", () => {
    const deck = suggestDeck(pool([land("Island", { typeLine: "Basic Land — Island" })]));

    expect(deck.nonbasicLands).toHaveLength(0);
    expect(deck.spells.map((c) => c.name)).not.toContain("Island");
    expect(deck.basicLands).toBe(DECK.size - LOW_CURVE_SPELLS);
  });

  // The caller's word beats the rule outright: a screen or a test asking for a
  // specific shape is not asking for advice.
  it("honours an explicit spellCount", () => {
    const deck = suggestDeck(pool(), { spellCount: DECK.spellCount });
    expect(deck.spells).toHaveLength(DECK.spellCount);
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
    //
    // Seven of them and not eight, because a deck this top-heavy triggers
    // DECK-03's own top end: 18 lands, and so 22 spells rather than 23. Which is
    // the land rule doing exactly what it is for on the most top-heavy curve
    // this file can construct.
    expect(deck.curve).toEqual([0, 15, 0, 0, 0, 7]);
    expect(deck.basicLands + deck.nonbasicLands.length).toBe(18);
  });

  // The half of a mana base the suggestion has never had. "Add 17 basics" is
  // not a deck, and no term in `cardValue` is about whether you can cast a card.
  describe("the mana base", () => {
    // cmc is summed off the symbols rather than guessed from the string's
    // length, which held for "{1}{W}" by coincidence and made "{4}{W}" a
    // two-drop -- so the deck never reached DECK-04's condition for a 17th land.
    const at = (name: string, color: string, manaCost: string, gih = 0.58) => {
      const cmc = [...manaCost.matchAll(/\{([^}]+)\}/g)].reduce(
        (n, [, s]) => n + (Number.isFinite(Number(s)) ? Number(s) : 1),
        0,
      );
      return mkCard(name, "common", [color as "W"], gih, { manaCost, cmc });
    };

    // MANA-07: a {B}{B} card wants black twice as badly as a {1}{B} one, and
    // counting cards says they want it the same.
    it("counts pips, not cards", () => {
      const pips = colorPips([at("A", "W", "{W}{W}"), at("B", "U", "{1}{U}")]);
      expect(pips.get("W")).toBe(2);
      expect(pips.get("U")).toBe(1);
    });

    it("counts a hybrid symbol for both of its colours", () => {
      const pips = colorPips([at("A", "W", "{W/U}")]);
      expect(pips.get("W")).toBe(1);
      expect(pips.get("U")).toBe(1);
    });

    // MANA-02's floor beats MANA-01's proportion, which is what the rules
    // actually say: never fewer than eight, and THEN favour the heavier colour.
    // Sixteen lands can only just pay two floors, so an uneven pip split still
    // comes back 8/8 -- and a proportional-only version of this gave the same
    // deck 9/7 and then flagged its own answer as uncastable.
    it("pays both floors before it favours anything", () => {
      const cards = [
        ...Array.from({ length: 14 }, (_, i) => at(`W${i}`, "W", "{1}{W}", 0.6)),
        ...Array.from({ length: 12 }, (_, i) => at(`U${i}`, "U", "{1}{U}", 0.59)),
      ];
      const deck = suggestDeck(cards);

      expect(deck.basicLands).toBe(16);
      expect(deck.basicsByColor).toEqual({ W: 8, U: 8 });
      expect(deck.uncastable).toEqual([]);
    });

    // And the 9/8 the corpus actually names appears at seventeen lands, where
    // there is a land spare once both floors are paid. The two rules meeting is
    // the reason this deck differs from the one above.
    it("gives the spare land to the colour asked for harder", () => {
      const cards = [
        ...Array.from({ length: 14 }, (_, i) => at(`W${i}`, "W", "{1}{W}", 0.6)),
        ...Array.from({ length: 8 }, (_, i) => at(`U${i}`, "U", "{1}{U}", 0.59)),
        // Four at five mana is exactly DECK-04's condition for the 17th land.
        ...Array.from({ length: 4 }, (_, i) => at(`Big${i}`, "W", "{4}{W}", 0.595)),
      ];
      const deck = suggestDeck(cards);
      const total = Object.values(deck.basicsByColor).reduce((a, b) => a + b, 0);

      expect(deck.basicLands).toBe(17);
      expect(total).toBe(deck.basicLands);
      expect(deck.basicsByColor.W).toBeGreaterThan(deck.basicsByColor.U);
    });

    // Rare by construction, and that is the point: the split pays every floor it
    // can afford, so this only fires on a deck asking for more colour than any
    // legal land count can serve. An advisory that went off on ordinary
    // two-colour decks would be noise.
    it("names the colours only when no land count could serve them", () => {
      const cards = [
        ...Array.from({ length: 9 }, (_, i) => at(`W${i}`, "W", "{W}{W}", 0.6)),
        ...Array.from({ length: 9 }, (_, i) => at(`U${i}`, "U", "{U}{U}", 0.6)),
        ...Array.from({ length: 9 }, (_, i) => at(`B${i}`, "B", "{B}{B}", 0.6)),
      ];
      const deck = suggestDeck(cards, {
        archetypes: archetypes([
          ["WU", 20000, 0.6],
          ["WUB", 20000, 0.6],
        ]),
      });

      // Three main colours want 24 sources and the deck has 16 lands.
      expect(deck.colors.sort()).toEqual(["B", "U", "W"]);
      expect(deck.uncastable.sort()).toEqual(["B", "U", "W"]);
    });

    // MANA-03: a dual counts once toward the land total and gives a source to
    // both its colours, so the basics it frees up are real.
    it("counts a dual toward both of its colours", () => {
      const dual = land("Sunlit Marsh", { colorIdentity: ["W", "U"] });
      const cards = [
        ...Array.from({ length: 13 }, (_, i) => at(`W${i}`, "W", "{1}{W}", 0.6)),
        ...Array.from({ length: 12 }, (_, i) => at(`U${i}`, "U", "{1}{U}", 0.59)),
        dual,
      ];
      const deck = suggestDeck(cards);

      expect(deck.nonbasicLands.map((c) => c.name)).toEqual(["Sunlit Marsh"]);
      // Seven basics each plus the dual is eight sources each, so the floors are
      // met on fifteen basics rather than sixteen.
      expect(deck.basicsByColor.W + 1).toBeGreaterThanOrEqual(8);
      expect(deck.basicsByColor.U + 1).toBeGreaterThanOrEqual(8);
      expect(deck.uncastable).toEqual([]);
    });
  });

  // DECK-04 states the rule with numbers in it, so it is testable as stated.
  describe("land count", () => {
    const at = (cmc: number, n: number) =>
      Array.from({ length: n }, (_, i) => mkCard(`C${cmc}-${i}`, "common", ["W"], 0.58, { cmc }));

    it("wants 16 lands on three or fewer cards at five-plus", () => {
      expect(landsFor([...at(2, 20), ...at(5, 3)])).toBe(16);
    });

    it("wants 17 once four or more cost five-plus", () => {
      expect(landsFor([...at(2, 19), ...at(5, 4)])).toBe(17);
    });

    it("wants 18 on a curve that cannot afford to miss its fourth drop", () => {
      expect(landsFor([...at(2, 16), ...at(6, 7)])).toBe(18);
    });

    // By `castingValue`, not `cmc`, so a split card counts on the half you would
    // actually cast -- the same rule the curve beside it is bucketed by.
    it("counts a split card on the half you would cast", () => {
      const splits = Array.from({ length: 5 }, (_, i) =>
        // cmc 6 is the SUM of the two halves, which is what marks this a split
        // card rather than an adventure -- see castingValue. You cast it for 2.
        mkCard(`Split${i}`, "common", ["W"], 0.58, { cmc: 6, manaCost: "{1}{W} // {3}{W}" }),
      );
      expect(landsFor([...at(2, 18), ...splits])).toBe(16);
    });
  });
});
