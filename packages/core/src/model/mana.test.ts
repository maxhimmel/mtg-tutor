import { describe, it, expect } from "vitest";
import { parseManaCost } from "./mana.js";

describe("parseManaCost", () => {
  it("splits a plain cost", () => {
    expect(parseManaCost("{2}{U}{U}")).toEqual(["2", "U", "U"]);
  });

  it("keeps compound symbols whole", () => {
    expect(parseManaCost("{W/U}{2/R}{G/P}{X}")).toEqual(["W/U", "2/R", "G/P", "X"]);
  });

  it("flattens a split card's two halves", () => {
    expect(parseManaCost("{1}{U} // {3}{U}")).toEqual(["1", "U", "3", "U"]);
  });

  it("is empty for a land or a missing cost", () => {
    expect(parseManaCost("")).toEqual([]);
    expect(parseManaCost(undefined)).toEqual([]);
  });
});
