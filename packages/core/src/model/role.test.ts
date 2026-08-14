import { describe, expect, it } from "vitest";
import { detectRole } from "./role.js";

// Since `detectRole` moved to ingest its answer is STORED on the card, so it
// decides which deck need a pick can meet -- DECK-06's bodies, DECK-08's
// removal -- for the whole life of a pool, and correcting it costs a re-ingest
// rather than a deploy. Every case below is a real wording that was classified
// wrongly, found by running the classifier over 5,119 cards and reading the
// output (`scripts/show-roles.mjs`).

const role = (oracleText: string, typeLine = "Creature — Human") =>
  detectRole({ oracleText, typeLine });

describe("detectRole and damage", () => {
  it("calls damage pointed at a creature removal", () => {
    expect(role("Bolt deals 3 damage to target creature.", "Instant")).toBe("removal");
  });

  // "any target" is a bolt, and a card that CAN point at a creature is one you
  // keep for a creature.
  it("counts any target, because it can be a creature", () => {
    expect(role("Bolt deals 3 damage to any target.", "Instant")).toBe("removal");
  });

  // 56 of 282 cards called removal across 17 sets were this: reach filed under
  // the role a deck stocks to survive.
  it("does not call damage aimed at a player removal", () => {
    expect(role("Whenever you cast a spell, this creature deals 1 damage to each opponent.")).toBe(
      "creature",
    );
    expect(role("Skullcrack deals 3 damage to target player.", "Instant")).not.toBe("removal");
  });

  // The bare `target` alternative in the first fix matched the word in "target
  // player", which put these straight back where they started.
  it("does not match on the word target alone", () => {
    expect(role("This creature deals 2 damage to target player or battle.")).not.toBe("removal");
  });
});

describe("detectRole and fighting", () => {
  // 44 spells sat in `other` because the amount is an expression rather than a
  // number, which is the most removal-shaped thing a green card does.
  it("reads the spelled-out wording", () => {
    expect(
      role(
        "Target creature you control deals damage equal to its power to target creature you don't control.",
        "Instant",
      ),
    ).toBe("removal");
  });

  it("reads it when the damage lands on more than one creature", () => {
    expect(
      role(
        "Target creature you control deals damage equal to its power to each of two other target creatures.",
        "Sorcery",
      ),
    ).toBe("removal");
  });

  it("reads the keyword modern sets print instead", () => {
    expect(role("Target creature you control fights up to one target creature.", "Instant")).toBe(
      "removal",
    );
  });
});

describe("detectRole and evasion", () => {
  it("reads a keyword the card has", () => {
    expect(role("Flying")).toBe("evasion");
    expect(role("Vigilance, trample")).toBe("evasion");
  });

  // 98 of 923 evasion cards handed it out rather than had it. A pump spell is
  // not a flier, and DECK-06 counts bodies.
  it("does not count a card that only grants it", () => {
    expect(role("Target creature gains flying until end of turn.", "Instant")).not.toBe("evasion");
    expect(role("Enchanted creature has trample.", "Enchantment — Aura")).not.toBe("evasion");
  });

  // A flier that also hands flying out is still a flier -- the line-by-line read
  // is what keeps both facts true at once.
  it("counts a card that has it AND grants it", () => {
    expect(role("Flying\nWhen this creature enters, target creature gains flying.")).toBe("evasion");
  });
});

describe("detectRole ordering", () => {
  // First match wins, and this is the consequence worth knowing: a body whose
  // text kills something counts toward DECK-08 and not DECK-06.
  it("prefers removal over the body it is printed on", () => {
    expect(role("When this creature enters, destroy target artifact.")).toBe("removal");
  });

  it("calls a land a land whatever its text says", () => {
    expect(role("{T}: Add {G}. This land deals 1 damage to target creature.", "Land")).toBe("land");
  });

  it("falls through to other for a card that does none of it", () => {
    expect(role("{T}: Add one mana of any color.", "Artifact")).toBe("other");
  });
});
