import { describe, expect, it } from "vitest";
import {
  jargonHits,
  loadVernacular,
  loadVernacularSources,
  validateVernacular,
  voiceBlock,
  type VernacularDoc,
} from "./vernacular.js";

const doc = loadVernacular();

describe("the vernacular corpus", () => {
  it("compiles with voice rules, avoided phrases and terms", () => {
    expect(doc.voice.length).toBeGreaterThan(5);
    expect(doc.avoid.length).toBeGreaterThan(5);
    expect(doc.terms.length).toBeGreaterThan(30);
  });

  // Every term either cites a page that exists or admits it has none. The
  // research behind this corpus found several words that are standard in speech
  // and defined nowhere, and the honest thing is to mark them rather than attach
  // the nearest plausible URL.
  it("gives every term either a real source index or an explicit gap", () => {
    const sources = loadVernacularSources();
    expect(sources.length).toBeGreaterThan(5);
    for (const t of doc.terms) {
      if (t.source == null) {
        expect(t.sourced, `${t.id} has neither a source nor sourced:false`).toBe(false);
      } else {
        expect(t.source).toBeGreaterThanOrEqual(1);
        expect(t.source).toBeLessThanOrEqual(sources.length);
      }
    }
  });

  // The failure the schema exists to catch. A capital in a phrase makes
  // `jargonHits` silently stop matching, and a metric that silently reads zero
  // is worse than no metric -- it reads as success.
  it("refuses an avoided phrase that is not lowercase", () => {
    const bad: VernacularDoc = {
      ...doc,
      avoid: [{ id: "X", phrase: "Defensible", instead: "fine", why: "because" }],
    };
    expect(() => validateVernacular(bad, "test")).toThrow(/lowercase/);
  });

  it("refuses a term with no source and no admission of one", () => {
    const bad: VernacularDoc = {
      ...doc,
      terms: [{ id: "x", category: "evaluation", short: "s", usage: "u" }],
    };
    expect(() => validateVernacular(bad, "test")).toThrow(/source/);
  });
});

describe("voiceBlock", () => {
  it("carries the rules and the replacements, and not the dictionary", () => {
    const block = voiceBlock();
    for (const v of doc.voice) expect(block).toContain(v.text);
    for (const a of doc.avoid) expect(block).toContain(a.instead);
    // `terms` is for people and for the agents working on this repo. Sending
    // fifty dictionary entries to a model that already knows what a bomb is
    // would cost more than everything else in this prompt and fix nothing --
    // the defect is grammar, not vocabulary.
    expect(block).not.toContain("Average Last Seen At");
  });

  // A blacklist alone sends a model to the nearest synonym, which is usually the
  // same register one word over. The replacement is the half that works.
  it("never names a banned phrase without saying what to write instead", () => {
    const block = voiceBlock();
    for (const a of doc.avoid) {
      const at = block.indexOf(`"${a.phrase}"`);
      expect(at, `${a.id} is not in the block`).toBeGreaterThan(-1);
      expect(block.slice(at)).toContain(a.instead);
    }
  });
});

describe("jargonHits", () => {
  // The sentence that started the corpus, verbatim from notes.md idea #13.
  it("catches the sentence this was built for", () => {
    const hits = jargonHits(
      "Fine pick, but the gap to Spectral Sailor is right at the margin, so they're " +
        "essentially indistinguishable in the data. Balmor is a strong payoff card that " +
        "pushes you toward spells-matter, while Spectral Sailor is a cheaper, higher-floor " +
        "flyer that fits nearly any blue deck — either is defensible at pick 1.",
    );
    expect(hits).toContain("higher-floor");
    expect(hits).toContain("defensible");
  });

  // Substring, not word-boundary: the interesting phrases are hyphenated and sit
  // inside a noun phrase, which is the whole grammatical complaint.
  it("finds a phrase buried inside a longer one", () => {
    expect(jargonHits("a high-ceiling build-around")).toEqual(["high-ceiling"]);
  });

  it("is case-insensitive, because prose starts sentences", () => {
    expect(jargonHits("Defensible, but only just.")).toEqual(["defensible"]);
  });

  // The metric has to be able to read zero, or a falling count means nothing.
  it("stays empty on an answer written the way the corpus asks", () => {
    expect(
      jargonHits(
        "The floor is high — a 2-mana 2/2 flier is never a dead card, and it goes in any " +
          "blue deck. I'd take either; it's close.",
      ),
    ).toEqual([]);
  });
});
