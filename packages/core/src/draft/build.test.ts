import { describe, it, expect } from "vitest";
import { mkCard } from "../testing/fakeSet.js";
import { buildDeck, compareDecks } from "./build.js";
import { suggestDeck } from "./deck.js";
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
