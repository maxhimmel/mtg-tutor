import { describe, expect, it } from "vitest";
import { indexInText, matchesCard, matchesText, type Matchable } from "./mechanicMatch.js";

const kw = (name: string, match?: string[]): Matchable => ({ name, kind: "keyword", match });
const action = (name: string, match?: string[]): Matchable => ({ name, kind: "action", match });
const word = (name: string): Matchable => ({ name, kind: "ability-word" });

describe("matchesText", () => {
  it("finds a keyword on the card that has it", () => {
    expect(matchesText(kw("Warp"), "Warp {1}{R}")).toBe(true);
    expect(matchesText(kw("Warp"), "Flying, vigilance")).toBe(false);
  });

  // Both of these matched nothing before the boundary was made conditional --
  // 10 cards of `one` and 40 of `dft`, found by nobody, reported by nothing.
  it("finds a mechanic whose name ends in punctuation", () => {
    expect(matchesText(kw("For Mirrodin!"), "For Mirrodin! When this Equipment enters")).toBe(true);
    expect(matchesText(kw("Start Your Engines!"), "Start your engines!")).toBe(true);
  });

  it("finds an action the card inflects", () => {
    expect(matchesText(action("Explore"), "Then it explores.")).toBe(true);
    expect(matchesText(action("Suspect"), "Suspected creatures can't block.")).toBe(true);
    expect(matchesText(action("Plot"), "It was plotted this turn.")).toBe(true);
  });

  // The inflection is a suffix, not a wildcard, so the boundary still has to
  // land at the end of a word.
  it("does not find a mechanic inside a longer word", () => {
    expect(matchesText(kw("Behold"), "Target Beholder you control")).toBe(false);
    expect(matchesText(kw("Void"), "Can't be blocked. Avoid this.")).toBe(false);
  });

  it("matches the phrases a card actually prints, not only the rules heading", () => {
    const ring = action("The Ring Tempts You", ["the Ring tempts you"]);
    expect(matchesText(ring, "When this creature enters, the Ring tempts you.")).toBe(true);
  });

  // An ability word has no rules meaning and appears only at the head of an
  // ability, before an em-dash. Anywhere else it is an ordinary English word,
  // which is what `void` and `raid` are.
  describe("ability words", () => {
    it("matches only in the position they are printed in", () => {
      expect(matchesText(word("Void"), "Void — At the beginning of your end step")).toBe(true);
      expect(matchesText(word("Void"), "Exile it into the void.")).toBe(false);
    });

    it("matches on a later line of a multi-ability card", () => {
      expect(matchesText(word("Raid"), "Flying\nRaid — When this creature enters")).toBe(true);
    });
  });
});

describe("matchesCard", () => {
  // Reminder text names other mechanics; matching inside it credits a card with
  // abilities it does not have.
  it("ignores a mechanic named only inside reminder text", () => {
    const card = { oracleText: "Flying (This creature can't be blocked except by reach.)" };
    expect(matchesCard(kw("Reach"), card)).toBe(false);
    expect(matchesCard(kw("Flying"), card)).toBe(true);
  });
});

describe("indexInText", () => {
  it("orders mechanics the way the card prints them", () => {
    const text = "Flying\nWarp {1}{R}";
    expect(indexInText(kw("Warp"), text)).toBeGreaterThan(indexInText(kw("Flying"), text));
  });

  it("is -1 for a mechanic the card does not have", () => {
    expect(indexInText(kw("Warp"), "Flying")).toBe(-1);
  });
});
