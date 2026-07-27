import { describe, it, expect } from "vitest";
import { canonicalName, cardNamePattern } from "./cardNames.js";

// What the web client does with the pattern: split the prose on it and keep the
// parts that canonicalize back to a known name.
function found(text: string, names: string[]): string[] {
  const pattern = cardNamePattern(names);
  if (!pattern) return [];
  const known = new Set(names.map(canonicalName));
  return text
    .split(pattern)
    .map(canonicalName)
    .filter((part) => known.has(part));
}

describe("cardNamePattern", () => {
  it("returns null for an empty list rather than a pattern that matches everywhere", () => {
    expect(cardNamePattern([])).toBeNull();
  });

  it("finds every named card in a coach answer", () => {
    const names = ["Embrace Oblivion", "Plasma Bolt", "Vaultguard Trooper"];
    const text =
      "Embrace Oblivion is solid early removal, but the red options " +
      "(Plasma Bolt, Vaultguard Trooper) are higher-impact threats.";
    expect(found(text, names)).toEqual(names);
  });

  it("leaves prose that names no card untouched", () => {
    const pattern = cardNamePattern(["Plasma Bolt"])!;
    const text = "Stay open; nothing here commits you to a color yet.";
    expect(text.split(pattern)).toEqual([text]);
  });

  it("prefers the longer name when one card's name contains another's", () => {
    expect(found("Skystinger Drake blocks well.", ["Skystinger", "Skystinger Drake"])).toEqual([
      "Skystinger Drake",
    ]);
  });

  it("does not match a short name inside a longer word", () => {
    expect(found("Honored Knight-Captain is fine.", ["Honor"])).toEqual([]);
  });

  it("matches a name the model spelled with a curly apostrophe", () => {
    expect(found("Meltstrider’s Resolve is a trick.", ["Meltstrider's Resolve"])).toEqual([
      "Meltstrider's Resolve",
    ]);
  });

  it("matches a name the model spelled with a typographic hyphen", () => {
    expect(found("Sledge‑Class Seedship wins late.", ["Sledge-Class Seedship"])).toEqual([
      "Sledge-Class Seedship",
    ]);
  });

  it("matches a double-faced card by its front face", () => {
    const names = ["Painter's Studio // Defaced Gallery", "Painter's Studio"];
    expect(found("Painter's Studio is a fine land.", names)).toEqual(["Painter's Studio"]);
  });

  it("still finds a card the coach wrote possessively", () => {
    expect(found("Plasma Bolt's two damage is enough.", ["Plasma Bolt"])).toEqual(["Plasma Bolt"]);
  });

  it("escapes regex metacharacters in a name", () => {
    expect(found("Don't Make a Sound is a trap.", ["Don't Make a Sound", "A + B (C)"])).toEqual([
      "Don't Make a Sound",
    ]);
  });
});
