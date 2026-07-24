import { describe, it, expect } from "vitest";
import { cardTypes, creatureTypes, parseTypeLine, tally } from "./typeLine.js";

describe("parseTypeLine", () => {
  it("splits supertypes, types and subtypes", () => {
    expect(parseTypeLine("Legendary Creature — Dragon Wizard")).toEqual({
      supertypes: ["Legendary"],
      types: ["Creature"],
      subtypes: ["Dragon", "Wizard"],
    });
  });

  it("handles a card with no subtypes", () => {
    expect(parseTypeLine("Instant")).toEqual({
      supertypes: [],
      types: ["Instant"],
      subtypes: [],
    });
  });

  it("reads a basic land", () => {
    expect(parseTypeLine("Basic Land — Island")).toEqual({
      supertypes: ["Basic"],
      types: ["Land"],
      subtypes: ["Island"],
    });
  });

  it("keeps both card types of an artifact creature", () => {
    expect(cardTypes({ typeLine: "Artifact Creature — Golem" })).toEqual(["Artifact", "Creature"]);
  });

  it("reads only the front face", () => {
    expect(cardTypes({ typeLine: "Creature — Human // Land" })).toEqual(["Creature"]);
  });
});

describe("creatureTypes", () => {
  it("returns the subtypes of a creature", () => {
    expect(creatureTypes({ typeLine: "Creature — Goblin Shaman" })).toEqual(["Goblin", "Shaman"]);
  });

  it("ignores subtypes that are not creature types", () => {
    expect(creatureTypes({ typeLine: "Enchantment — Aura" })).toEqual([]);
    expect(creatureTypes({ typeLine: "Land — Forest" })).toEqual([]);
  });
});

describe("tally", () => {
  it("counts groups, most common first", () => {
    const pool = [
      { typeLine: "Creature — Goblin" },
      { typeLine: "Creature — Goblin Shaman" },
      { typeLine: "Instant" },
    ];
    expect(tally(pool, cardTypes)).toEqual([
      ["Creature", 2],
      ["Instant", 1],
    ]);
    expect(tally(pool, creatureTypes)).toEqual([
      ["Goblin", 2],
      ["Shaman", 1],
    ]);
  });
});
