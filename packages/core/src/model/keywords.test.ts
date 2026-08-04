import { describe, it, expect } from "vitest";
import { cardShapeOf, keywordsOf } from "./keywords.js";

const names = (oracleText: string) => keywordsOf({ oracleText }).map((k) => k.name);

describe("keywordsOf", () => {
  it("finds keywords in the order they are printed", () => {
    expect(names("Flying, vigilance")).toEqual(["Flying", "Vigilance"]);
  });

  it("ignores keywords that only appear in reminder text", () => {
    const flier =
      "Flying (This creature can't be blocked except by creatures with flying or reach.)";
    expect(names(flier)).toEqual(["Flying"]);
  });

  it("does not read double strike as first strike", () => {
    expect(names("Double strike")).toEqual(["Double strike"]);
    expect(names("First strike")).toEqual(["First strike"]);
  });

  it("matches a keyword that carries a number", () => {
    expect(names("When this creature enters, surveil 2.")).toEqual(["Surveil"]);
  });

  it("does not match a keyword inside a longer word", () => {
    expect(names("This creature is unreachable by mere words.")).toEqual([]);
  });

  it("finds a keyword the card grants to something else", () => {
    expect(names("Target creature gains trample until end of turn.")).toEqual(["Trample"]);
  });

  it("is empty for vanilla rules text", () => {
    expect(names("When this creature dies, draw a card.")).toEqual([]);
  });

  // The five the app was missing, each in the wording its own set prints.
  it("finds the set mechanics", () => {
    expect(names("Bargain\nWhen this enchantment enters, destroy target creature.")).toEqual([
      "Bargain",
    ]);
    expect(names("Backup 1\nFlying")).toEqual(["Backup", "Flying"]);
    expect(names("When you cast this spell, discover 4.")).toEqual(["Discover"]);
    expect(names("Storm\nTarget player loses 2 life.")).toEqual(["Storm"]);
  });
});

// Names as Scryfall prints them, so the type line and the layout are the pair
// cardShapeOf actually has to read apart.
const shape = (layout: string | undefined, typeLine: string) =>
  cardShapeOf({ layout, typeLine })?.name;

describe("cardShapeOf", () => {
  it("tells an Adventure from an Omen, which share a layout", () => {
    expect(shape("adventure", "Creature — Faerie Rogue // Instant — Adventure")).toBe("Adventure");
    expect(shape("adventure", "Creature — Dragon // Sorcery — Omen")).toBe("Omen");
  });

  it("tells a Room from a split card, which share a layout", () => {
    expect(shape("split", "Enchantment — Room // Enchantment — Room")).toBe("Room");
    expect(shape("split", "Sorcery // Sorcery")).toBe("Split card");
  });

  it("names the shapes no card names on itself", () => {
    expect(shape("transform", "Legendary Creature — Kithkin Warrior // Legendary Creature — Kithkin Soldier")).toBe(
      "Double-faced card",
    );
    expect(shape("prepare", "Creature — Human Wizard // Sorcery")).toBe("Prepared spell");
  });

  it("says nothing about a layout that is only a frame", () => {
    expect(shape("saga", "Enchantment — Saga")).toBeUndefined();
    expect(shape("class", "Enchantment — Class")).toBeUndefined();
    expect(shape("case", "Enchantment — Case")).toBeUndefined();
  });

  // A card ingested before the field existed gets the ordinary card's answer
  // rather than a guess: the type line alone cannot tell a split card from a
  // double-faced one.
  it("says nothing when the layout is unknown", () => {
    expect(shape(undefined, "Creature — Faerie Rogue // Instant — Adventure")).toBeUndefined();
    expect(shape(undefined, "Creature — Human")).toBeUndefined();
  });
});
