import { describe, expect, it } from "vitest";
import { COLOR_TOKEN, isColorToken, spokenColors } from "./colorTokens";

// What the prose renderer actually does: split, then ask of each piece whether
// it is shorthand. Testing the pair together is the only way to catch a pattern
// that matches something the set then refuses -- that piece is left as text, and
// a test on either half alone would call it a pass.
const found = (text: string): string[] =>
  text.split(COLOR_TOKEN).filter((part) => isColorToken(part));

// The renderer draws every piece, matched or not, so the pieces have to add back
// up to the sentence. A shape the pattern captures and the set then refuses --
// "GG", "WW", "GW" -- is the case that would lose it: the split still cuts
// there, and the piece has to survive as text rather than fall through a branch
// that only draws tokens.
const rejoined = (text: string): string => text.split(COLOR_TOKEN).join("");

describe("colour shorthand in prose", () => {
  it("finds a pair, a triple and the whole wheel", () => {
    expect(found("fits your spells-matter UR shell fine")).toEqual(["UR"]);
    expect(found("a BRG pile with no payoff")).toEqual(["BRG"]);
    expect(found("WUBRG is not a deck")).toEqual(["WUBRG"]);
  });

  it("finds more than one in a sentence", () => {
    expect(found("UB was open, WG never was")).toEqual(["UB", "WG"]);
  });

  it("keeps the prose around it", () => {
    expect("your UR shell".split(COLOR_TOKEN)).toEqual(["your ", "UR", " shell"]);
  });

  // The suffix cases: a possessive or a hyphenated compound is still the token,
  // and losing them would mean the one word the sentence is built on renders as
  // pips followed by nothing.
  it("allows a possessive or a hyphen to follow", () => {
    expect(found("UR's ceiling")).toEqual(["UR"]);
    expect(found("a UR-based plan")).toEqual(["UR"]);
  });
});

describe("what it refuses", () => {
  // The whole risk of the transform. Every one of these is a real string this
  // app or its coach produces.
  it("leaves a win rate alone", () => {
    expect(found("You took Kulrath Zealot (GIH WR 56.2%)")).toEqual([]);
    expect(found("GP WR 54.1%")).toEqual([]);
  });

  it("leaves a single letter alone, because a grade is one", () => {
    expect(found("a B pick at best")).toEqual([]);
    expect(found("solid in U")).toEqual([]);
  });

  it("does not reach inside a word", () => {
    expect(found("URGENT")).toEqual([]);
    expect(found("BUGBEAR")).toEqual([]);
    expect(found("Ur-Golem's Eye")).toEqual([]);
  });

  it("does not match a colour nickname that is also a word", () => {
    expect(found("a BUG midrange pile")).toEqual([]);
    expect(found("RUG tempo")).toEqual([]);
    expect(found("GRUB")).toEqual([]);
  });

  it("does not match lower case", () => {
    expect(found("bug")).toEqual([]);
    expect(found("ur")).toEqual([]);
  });

  // Out of order and repeated letters are shapes, not spellings. `prompt.ts`
  // asks the model for WUBRG order; anything else stays as the letters it wrote.
  it("does not match an order it was not promised", () => {
    expect(found("GW aggro")).toEqual([]);
    expect(found("RU spells")).toEqual([]);
    expect(found("GG no re")).toEqual([]);
  });

  it("does not reach into a pick coordinate", () => {
    expect(found("P1P1UR")).toEqual([]);
    expect(found("2UR")).toEqual([]);
  });
});

// Not a property of the pattern but of the pair, and the pair is what the
// renderer is. A capture the set refuses is drawn by the same branch that draws
// the prose, so nothing may be dropped between the cut and the page.
describe("every sentence survives the split whole", () => {
  const sentences = [
    "GG",
    "WW",
    "GW aggro was never open",
    "Spectacular Skywhale fits your UR shell — GIH WR 56.2%, a B pick at best",
    "UR",
    "UR and WUB and RU and BUG, back to back",
    "no colours here at all",
    "",
  ];

  it("loses no character, whether the piece was a token or not", () => {
    for (const sentence of sentences) expect(rejoined(sentence)).toBe(sentence);
  });

  // Where the whole string IS the token there is an empty piece on either side.
  // Harmless to render, and the assertion is here so a change that starts
  // trimming them has to be deliberate.
  it("cuts a refused shape out as its own piece", () => {
    expect("GG".split(COLOR_TOKEN)).toEqual(["", "GG", ""]);
    expect("WW".split(COLOR_TOKEN)).toEqual(["", "WW", ""]);
    expect(found("GG")).toEqual([]);
    expect(found("WW")).toEqual([]);
  });
});

describe("spokenColors", () => {
  it("says the colours as the sentence would", () => {
    expect(spokenColors("UR")).toBe("blue-red");
    expect(spokenColors("WUB")).toBe("white-blue-black");
  });
});
