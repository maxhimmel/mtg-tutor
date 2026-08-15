import { describe, expect, it } from "vitest";
import { frontIsSideways } from "./orientation.js";

// Type lines and layouts as Scryfall actually returns them, checked against the
// live API rather than written from memory -- the whole point of this function
// is that the obvious rule (rotate the double-faced ones) is wrong.
describe("frontIsSideways", () => {
  it("turns a Room, which is a split card", () => {
    expect(
      frontIsSideways({ layout: "split", typeLine: "Enchantment — Room // Enchantment — Room" }),
    ).toBe(true);
  });

  it("turns an ordinary split card too", () => {
    expect(frontIsSideways({ layout: "split", typeLine: "Instant // Sorcery" })).toBe(true);
  });

  it("turns a Battle", () => {
    expect(
      frontIsSideways({ layout: "transform", typeLine: "Battle — Siege // Creature — Elemental" }),
    ).toBe(true);
  });

  // The case that makes the Battle rule a type-line rule and not a layout rule:
  // same layout, upright card.
  it("leaves an ordinary transforming card alone", () => {
    expect(
      frontIsSideways({ layout: "transform", typeLine: "Creature — Human // Creature — Werewolf" }),
    ).toBe(false);
  });

  it("leaves an Adventure alone", () => {
    expect(
      frontIsSideways({ layout: "adventure", typeLine: "Creature — Faerie // Instant — Adventure" }),
    ).toBe(false);
  });

  it("leaves a plain card alone, layout or no layout", () => {
    expect(frontIsSideways({ typeLine: "Creature — Elf Druid" })).toBe(false);
    expect(frontIsSideways({ layout: "saga", typeLine: "Enchantment — Saga" })).toBe(false);
  });

  // A creature that fights in one is not a Battle, and only the front face's
  // types are read -- a Battle's own back is a Creature and must not match.
  it("does not match on the back face's types", () => {
    expect(
      frontIsSideways({ layout: "transform", typeLine: "Creature — Elemental // Battle — Siege" }),
    ).toBe(false);
  });
});
