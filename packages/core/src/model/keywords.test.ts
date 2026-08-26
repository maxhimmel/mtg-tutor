import { describe, it, expect } from "vitest";
import { cardShapeOf, keywordsOf } from "./keywords.js";

const names = (oracleText: string) => keywordsOf({ oracleText }).map((k) => k.name);
const names_ = names;

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
    expect(shape("prepare", "Creature — Human Wizard // Sorcery")).toBe("Prepared spell");
  });

  // The preview draws the back face beside the front, which says everything the
  // note would have said and does not need reading.
  it("says nothing about a card whose back is already on screen", () => {
    expect(
      shape("transform", "Legendary Creature — Kithkin Warrior // Legendary Creature — Kithkin Soldier"),
    ).toBeUndefined();
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

// The whole point of the corpus, from the panel's side.
describe("keywordsOf, with the set-mechanics corpus", () => {
  it("explains the mechanic LTR never printed a reminder for", () => {
    const found = keywordsOf({ oracleText: "Sacrifice this: draw a card. The Ring tempts you." });
    expect(found.map((k) => k.name)).toContain("The Ring Tempts You");
    expect(found.find((k) => k.name === "The Ring Tempts You")?.reminder).toMatch(/Ring-bearer/);
  });

  it("still finds the evergreen keywords beside it", () => {
    const names = names_("Flying\nWhenever this creature enters, the Ring tempts you.");
    expect(names).toContain("Flying");
    expect(names).toContain("The Ring Tempts You");
  });

  // A card is hovered because of the part that is unfamiliar.
  it("puts the set mechanic ahead of an evergreen keyword at the same spot", () => {
    const names = names_("Warp {1}{R}\nFlying");
    expect(names.indexOf("Warp")).toBeLessThan(names.indexOf("Flying"));
  });

  it("prefers the specific mechanic over the general one it contains", () => {
    const names = names_("When this creature enters, manifest dread.");
    expect(names).toContain("Manifest Dread");
    expect(names).not.toContain("Manifest");
  });

  // An ability word is an ordinary English word anywhere but the head of an
  // ability, which is why the corpus records what kind each mechanic is.
  it("does not read an ability word out of ordinary rules text", () => {
    expect(names_("Exile it into the void.")).not.toContain("Void");
    expect(names_("Void — At the beginning of your end step, draw a card.")).toContain("Void");
  });

  it("says nothing about a vanilla creature", () => {
    expect(names_("")).toEqual([]);
  });
});
