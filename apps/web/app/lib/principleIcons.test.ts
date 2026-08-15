import { describe, expect, it } from "vitest";
import { loadPrinciples } from "@mtg-tutor/core";
import { PRINCIPLE_ICONS } from "./principleIcons";

// The one thing worth asserting about a table of decorations: that it covers the
// thing it decorates. A category authored into the YAML with no mark here draws
// nothing at all -- which is indistinguishable on screen from a category whose
// mark is simply subtle, and so would never be reported.
describe("principle icons", () => {
  const categories = [...new Set(loadPrinciples().principles.map((p) => p.category))].sort();

  it("has a mark for every category in the corpus", () => {
    expect(categories.filter((c) => !PRINCIPLE_ICONS[c])).toEqual([]);
  });

  // The other direction, which catches a category that was renamed rather than
  // added: the old key would sit here forever, drawn by nothing.
  it("has no mark for a category the corpus does not have", () => {
    expect(Object.keys(PRINCIPLE_ICONS).sort().filter((k) => !categories.includes(k))).toEqual([]);
  });
});
