import { describe, it, expect } from "vitest";
import { mkCard } from "../testing/fakeSet.js";
import {
  alignDecks,
  buildDeck,
  compareDecks,
  deckPiles,
  deckSizeNote,
  decksAgree,
  isLandCount,
  isLegalDeck,
} from "./build.js";
import { suggestDeck, type DeckSuggestion } from "./deck.js";
import type { Bench } from "../model/bench.js";
import type { Card } from "../model/card.js";

const spell = (name: string, color: "W" | "U" | "B", gih = 0.55, cmc = 2): Card =>
  mkCard(name, "common", [color], gih, { cmc });

const land = (name: string, overrides: Partial<Card> = {}): Card =>
  mkCard(name, "common", [], 0.52, { typeLine: "Land", ...overrides });

describe("buildDeck", () => {
  it("counts spells, drafted lands and basics as one 40", () => {
    const maindeck = [
      ...Array.from({ length: 22 }, (_, i) => spell(`W${i}`, "W")),
      land("Evolving Wilds"),
    ];
    const deck = buildDeck(maindeck, 17);

    expect(deck.spells).toHaveLength(22);
    expect(deck.nonbasicLands.map((c) => c.name)).toEqual(["Evolving Wilds"]);
    expect(deck.size).toBe(40);
  });

  it("does not count a drafted basic, which was free", () => {
    const maindeck = [spell("W0", "W"), land("Island", { typeLine: "Basic Land — Island" })];
    const deck = buildDeck(maindeck, 17);

    expect(deck.spells).toHaveLength(1);
    expect(deck.nonbasicLands).toHaveLength(0);
    expect(deck.size).toBe(18);
  });

  it("names every color the deck asks for, splash included", () => {
    const deck = buildDeck([spell("W0", "W"), spell("U0", "U"), spell("B0", "B")], 17);

    expect(deck.colors).toEqual(["W", "U", "B"]);
  });

  it("curves the spells and leaves the lands out of it", () => {
    const deck = buildDeck([spell("W0", "W", 0.55, 1), spell("W1", "W", 0.55, 9), land("X")], 17);

    expect(deck.curve).toEqual([1, 0, 0, 0, 0, 1]);
  });

  // Scryfall gives a split card the combined mana value of both halves, so the
  // deck's own curve has to go through the same casting-value rule the chart
  // does or a Room turns up among the six-drops of a deck that has none.
  it("curves a split card on the half you would cast", () => {
    const room = mkCard("Dazzling Theater // Prop Room", "common", ["W"], 0.55, {
      cmc: 7,
      manaCost: "{3}{W} // {2}{W}",
      typeLine: "Enchantment — Room",
    });
    const deck = buildDeck([room], 17);

    expect(deck.curve).toEqual([0, 0, 1, 0, 0, 0]);
  });
});

describe("deckPiles", () => {
  const at = (name: string, cmc: number) => spell(name, "W", 0.55, cmc);

  it("splits the pool the way the bench says", () => {
    const pool = [at("A", 1), at("B", 2), at("C", 3)];
    const { maindeck, sideboard } = deckPiles(pool, [{ pos: 1, atPick: 1 }]);

    expect(maindeck.map((p) => p.card.name)).toEqual(["A", "C"]);
    expect(sideboard.map((p) => p.card.name)).toEqual(["B"]);
  });

  // Two copies of a common is a normal draft, and the position is the only
  // thing that tells one from the other once they are sorted together.
  it("keeps each pick's position through the sort", () => {
    const pool = [at("Twin", 5), at("Cheap", 1), at("Twin", 5)];
    const { maindeck } = deckPiles(pool, []);

    expect(maindeck.map((p) => [p.card.name, p.pos])).toEqual([
      ["Cheap", 1],
      ["Twin", 0],
      ["Twin", 2],
    ]);
  });

  it("orders each pile by the turn it comes down on", () => {
    const pool = [at("Five", 5), at("One", 1), at("Three", 3)];

    expect(deckPiles(pool, []).maindeck.map((p) => p.card.name)).toEqual([
      "One",
      "Three",
      "Five",
    ]);
  });

  // The same rule the curve uses: nobody has ever paid a split card's combined
  // mana value, so it must not sort as if they had.
  it("sorts a split card on the half you would cast", () => {
    const room = mkCard("Room", "common", ["W"], 0.55, {
      cmc: 7,
      manaCost: "{3}{W} // {2}{W}",
      typeLine: "Enchantment — Room",
    });
    const pool = [at("Four", 4), room as Card];

    expect(deckPiles(pool, []).maindeck.map((p) => p.card.name)).toEqual(["Room", "Four"]);
  });

  // The deck as it stands, not as it stood: a card benched at pick 40 is out of
  // the deck you are building now, whenever it was drafted.
  it("counts a late bench, unlike the per-pick split", () => {
    const pool = [at("A", 1), at("B", 2)];
    const bench: Bench[] = [{ pos: 0, atPick: 40 }];

    expect(deckPiles(pool, bench).sideboard.map((p) => p.card.name)).toEqual(["A"]);
  });
});

describe("what counts as built", () => {
  const forty = (n: number) =>
    buildDeck(
      Array.from({ length: n }, (_, i) => spell(`W${i}`, "W")),
      40 - n,
    );

  it("is forty cards exactly, in both directions", () => {
    expect(isLegalDeck(forty(23))).toBe(true);
    expect(isLegalDeck(buildDeck([spell("W0", "W")], 17))).toBe(false);
    expect(isLegalDeck(buildDeck(Array.from({ length: 30 }, (_, i) => spell(`W${i}`, "W")), 17)))
      .toBe(false);
  });

  it("says how far off, and says nothing when it is there", () => {
    expect(deckSizeNote(forty(23))).toBeNull();
    expect(deckSizeNote(buildDeck([spell("W0", "W")], 17))).toBe("22 short");
    expect(
      deckSizeNote(buildDeck(Array.from({ length: 25 }, (_, i) => spell(`W${i}`, "W")), 17)),
    ).toBe("2 too many");
  });

  it("takes a whole number of basics, up to a deck of them", () => {
    expect(isLandCount(17)).toBe(true);
    expect(isLandCount(0)).toBe(true);
    expect(isLandCount(40)).toBe(true);
    expect(isLandCount(41)).toBe(false);
    expect(isLandCount(-1)).toBe(false);
    expect(isLandCount(16.5)).toBe(false);
    expect(isLandCount(NaN)).toBe(false);
  });
});

describe("compareDecks", () => {
  const suggestionOf = (cards: Card[]) => suggestDeck(cards);

  it("lists only what the two decks disagree about", () => {
    const shared = Array.from({ length: 22 }, (_, i) => spell(`W${i}`, "W", 0.6));
    const pool = [...shared, spell("Keeper", "U", 0.59), spell("Cut", "U", 0.58)];

    // The suggestion fills its 23rd slot with the better of the two; the player
    // took the other.
    const suggested = suggestionOf(pool);
    const built = buildDeck([...shared, pool[23]], 17);
    const diff = compareDecks(built, suggested);

    expect(diff.shared).toBe(22);
    expect(diff.onlySuggested.map((c) => c.name)).toEqual(["Keeper"]);
    expect(diff.onlyBuilt.map((c) => c.name)).toEqual(["Cut"]);
  });

  it("agrees completely when the decks are the same", () => {
    const pool = Array.from({ length: 23 }, (_, i) => spell(`W${i}`, "W", 0.6));
    const suggested = suggestionOf(pool);
    const diff = compareDecks(buildDeck(pool, 17), suggested);

    expect(diff.onlySuggested).toHaveLength(0);
    expect(diff.onlyBuilt).toHaveLength(0);
    expect(diff.shared).toBe(23);
    expect(decksAgree(diff)).toBe(true);
  });

  // One card each way is still a disagreement, and the headline that leads with
  // it has to read the diff rather than the count they have in common.
  it("does not call two decks the same over a card swapped both ways", () => {
    const shared = Array.from({ length: 22 }, (_, i) => spell(`W${i}`, "W", 0.6));
    const pool = [...shared, spell("Keeper", "U", 0.59), spell("Cut", "U", 0.58)];
    const diff = compareDecks(buildDeck([...shared, pool[23]], 17), suggestionOf(pool));

    expect(decksAgree(diff)).toBe(false);
  });

  // Drafting two of a common is normal, and a diff keyed on names rather than
  // counts would call a deck playing one copy identical to one playing both.
  it("counts copies, so playing one of two is a real disagreement", () => {
    const filler = Array.from({ length: 21 }, (_, i) => spell(`W${i}`, "W", 0.6));
    const pool = [...filler, spell("Twin", "W", 0.59), spell("Twin", "W", 0.59)];

    const suggested = suggestionOf(pool);
    const built = buildDeck([...filler, pool[21]], 17);
    const diff = compareDecks(built, suggested);

    expect(suggested.spells.filter((c) => c.name === "Twin")).toHaveLength(2);
    expect(diff.onlySuggested.map((c) => c.name)).toEqual(["Twin"]);
    expect(diff.onlyBuilt).toHaveLength(0);
  });

  it("compares total lands, drafted and basic together", () => {
    const pool = [
      ...Array.from({ length: 23 }, (_, i) => spell(`W${i}`, "W", 0.6)),
      land("Evolving Wilds"),
    ];
    const suggested = suggestionOf(pool);
    const diff = compareDecks(buildDeck([...pool], 16), suggested);

    // The suggestion plays the fixer and 16 basics; the player plays it and 16
    // too, so the totals agree even though the basics do not have to.
    expect(diff.lands).toEqual({ built: 17, suggested: 17 });
  });
});

describe("alignDecks", () => {
  const at = (name: string, cmc: number) => spell(name, "W", 0.55, cmc);
  const asSuggestion = (spells: Card[], nonbasicLands: Card[] = []): DeckSuggestion => ({
    colors: ["W"],
    spells,
    nonbasicLands,
    basicLands: 40 - spells.length - nonbasicLands.length,
    curve: [],
  });

  it("gives a card both decks play one row, not two", () => {
    const shared = Array.from({ length: 22 }, (_, i) => spell(`W${i}`, "W", 0.6));
    const pool = [...shared, spell("Keeper", "U", 0.59), spell("Cut", "U", 0.58)];

    const suggested = suggestDeck(pool);
    const built = buildDeck([...shared, pool[23]], 17);
    const rows = alignDecks(built, suggested);

    // Twenty-three cards a side, laid out in twenty-four rows rather than
    // forty-six: the whole reason the comparison fits on a screen.
    expect(rows).toHaveLength(24);
    expect(rows.filter((r) => r.built && r.suggested)).toHaveLength(
      compareDecks(built, suggested).shared,
    );
    expect(rows.filter((r) => !r.built).map((r) => r.suggested?.name)).toEqual(["Keeper"]);
    expect(rows.filter((r) => !r.suggested).map((r) => r.built?.name)).toEqual(["Cut"]);
  });

  it("reads down the curve on both sides at once", () => {
    const built = buildDeck([at("Five", 5), at("One", 1)], 17);
    const suggested = asSuggestion([at("Three", 3), at("One", 1)]);

    expect(alignDecks(built, suggested).map((r) => [r.built?.name, r.suggested?.name])).toEqual([
      ["One", "One"],
      [undefined, "Three"],
      ["Five", undefined],
    ]);
  });

  // Drafting two of a common is normal. Pairing by name alone would put both
  // copies opposite the one the suggestion plays and lose the disagreement.
  it("pairs copies one at a time and leaves the odd one on its own row", () => {
    const built = buildDeck([at("Twin", 2), at("Twin", 2)], 17);
    const rows = alignDecks(built, asSuggestion([at("Twin", 2)]));

    expect(rows.map((r) => [r.built?.name, r.suggested?.name])).toEqual([
      ["Twin", "Twin"],
      ["Twin", undefined],
    ]);
  });

  it("lays a drafted land out with the spells it comes down beside", () => {
    const fixer = land("Evolving Wilds", { cmc: 0 });
    const built = buildDeck([at("Two", 2), fixer], 17);
    const rows = alignDecks(built, asSuggestion([at("Two", 2)], [fixer]));

    expect(rows.map((r) => [r.built?.name, r.suggested?.name])).toEqual([
      ["Evolving Wilds", "Evolving Wilds"],
      ["Two", "Two"],
    ]);
  });
});
