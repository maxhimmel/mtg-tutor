import { describe, it, expect } from "vitest";
import { STAT_LEGEND } from "./cardLine.js";
import { CARD_STAT_GLOSSARY, SCORING_GLOSSARY } from "./glossary.js";

const ALL = [...CARD_STAT_GLOSSARY, ...SCORING_GLOSSARY];

describe("glossary corpus", () => {
  it("has no duplicate ids", () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a label, a one-line summary and at least one paragraph", () => {
    for (const e of ALL) {
      expect(e.label, e.id).toBeTruthy();
      expect(e.name, e.id).toBeTruthy();
      expect(e.short, e.id).toBeTruthy();
      expect(e.detail.length, e.id).toBeGreaterThan(0);
    }
  });

  // The hover panel keys its rows on these ids and falls back to printing the
  // raw id when a lookup misses -- so a rename in this file would silently show
  // "pick-order" where "ATA / ALSA" belongs. Web has no test runner; this is the
  // guard.
  it("keeps the ids the hover panel renders rows for", () => {
    const ids = new Set(CARD_STAT_GLOSSARY.map((e) => e.id));
    for (const id of ["gih", "iwd", "pick-order", "maindeck", "gpwr"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("STAT_LEGEND", () => {
  // The legend wraps to 78 columns, so a definition spans lines and a raw
  // substring match on it would fail for the wrong reason. Flattening the
  // whitespace lets the assertion be the whole sentence rather than a fragment.
  const flat = STAT_LEGEND.replace(/\s+/g, " ");

  // The legend is built from the corpus rather than written twice; if the
  // derivation breaks, the coach silently loses its definitions.
  it("carries every card stat's label, summary and caveat verbatim", () => {
    for (const e of CARD_STAT_GLOSSARY) {
      expect(flat, e.id).toContain(e.label);
      expect(flat, e.id).toContain(e.short.replace(/\s+/g, " "));
      if (e.caveat) expect(flat, e.id).toContain(e.caveat.replace(/\s+/g, " "));
    }
  });

  // The page-only prose must NOT leak into the prompt: `detail` exists to be
  // read at leisure, and pasting it into every request would bloat the system
  // prompt for no gain.
  it("leaves the long-form detail on the page", () => {
    for (const e of CARD_STAT_GLOSSARY) {
      for (const p of e.detail) {
        expect(flat, e.id).not.toContain(p.replace(/\s+/g, " "));
      }
    }
  });

  it("keeps the instructions the model needs and the corpus has no place for", () => {
    expect(STAT_LEGEND).toContain("Do not recite them back");
    expect(STAT_LEGEND).toContain("riding its deck");
    expect(STAT_LEGEND).toContain("the verdict cannot see it");
  });

  it("wraps to a readable width", () => {
    for (const line of STAT_LEGEND.split("\n")) {
      expect(line.length, line).toBeLessThanOrEqual(80);
    }
  });
});
