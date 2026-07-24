import { describe, it, expect } from "vitest";
import { DECK } from "../config.js";
import { mkCard } from "../testing/fakeSet.js";
import { suggestDeck } from "./deck.js";
import type { Card } from "../model/card.js";

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
});
