import { describe, expect, it } from "vitest";
import { loadVernacular } from "../tutor/vernacular.js";
import { allMechanics, loadMechanics } from "./mechanics.js";
import {
  checkOriginal,
  validateMechanics,
  type Mechanic,
  type MechanicsDoc,
} from "./mechanicsSchema.js";

const doc = (...mechanics: MechanicsDoc["mechanics"]): MechanicsDoc => ({
  meta: { title: "test" },
  mechanics,
});

const ok = {
  name: "Warp",
  kind: "keyword",
  rule: "702.184",
  short: "Cast it early, cheap.",
} satisfies Mechanic;

describe("the shipped corpus", () => {
  // Codegen already ran this. Running it again here is not redundant: codegen
  // runs on the machine that edited the YAML, and this runs on every machine
  // that runs the tests -- including a generated file somebody hand-edited,
  // which is the one path the banner asks for and cannot enforce.
  it("passes its own validation, against the live avoid list", () => {
    const avoided = loadVernacular().avoid.map((a) => a.phrase);
    expect(() => validateMechanics(loadMechanics(), "shipped", avoided)).not.toThrow();
  });

  it("carries the mechanics that moved out of keywords.ts", () => {
    const names = allMechanics().map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Saddle", "Discover", "Backup", "Bargain"]));
  });
});

describe("validateMechanics", () => {
  it("accepts a well-formed entry", () => {
    expect(() => validateMechanics(doc(ok), "t")).not.toThrow();
  });

  it("rejects an empty corpus", () => {
    expect(() => validateMechanics(doc(), "t")).toThrow(/No mechanics/);
  });

  it("rejects a duplicate name whatever its case", () => {
    expect(() => validateMechanics(doc(ok, { ...ok, name: "warp" }), "t")).toThrow(/Duplicate/);
  });

  it("rejects an unknown kind", () => {
    // @ts-expect-error -- the point of the check is the corpus that got past the type
    expect(() => validateMechanics(doc({ ...ok, kind: "mechanic" }), "t")).toThrow(/unknown kind/);
  });

  it("rejects a mechanic with no definition", () => {
    expect(() => validateMechanics(doc({ ...ok, short: "" }), "t")).toThrow(/no definition/);
  });

  // The vernacular corpus holds terms to this and the reason carries over: a
  // citation nobody can check is worse than saying there is none.
  it("rejects a missing rule unless the gap is admitted", () => {
    const { rule, ...noRule } = ok;
    expect(() => validateMechanics(doc(noRule), "t")).toThrow(/sourced: false/);
    expect(() => validateMechanics(doc({ ...noRule, sourced: false }), "t")).not.toThrow();
  });

  it("rejects an empty match phrase", () => {
    expect(() => validateMechanics(doc({ ...ok, match: ["  "] }), "t")).toThrow(/empty match/);
  });

  // These definitions go into the coach's prompt, so the voice rules bind them
  // exactly as they bind what the model writes back.
  it("rejects a definition using a phrase the vernacular corpus avoids", () => {
    const bad = { ...ok, short: "Either half is defensible here." };
    expect(() => validateMechanics(doc(bad), "t", ["defensible"])).toThrow(/vernacular/);
  });
});

describe("checkOriginal", () => {
  // 701.54a, near enough. The real one is what a lazy paraphrase would start
  // from, which is the case worth having a fixture for.
  const rules =
    "701.54a Certain spells and abilities have the text “the Ring tempts you.” Each time " +
    "the Ring tempts you, choose a creature you control. That creature becomes your " +
    "Ring-bearer.";

  it("passes prose that only shares the mechanic's own name", () => {
    const mine = {
      ...ok,
      name: "The Ring Tempts You",
      short: "You name one of your creatures the Ring-bearer, and take an emblem that grows.",
    };
    expect(() => checkOriginal(doc(mine), rules)).not.toThrow();
  });

  it("catches a definition that stopped paraphrasing", () => {
    const lifted = {
      ...ok,
      short: "Each time the Ring tempts you, choose a creature you control. That creature " +
        "becomes your Ring-bearer.",
    };
    expect(() => checkOriginal(doc(lifted), rules)).toThrow(/consecutive words/);
  });

  // The rules are typeset with curly quotes and we write straight ones. Same
  // sentence, and the check has to see through that or it never fires on the
  // text it exists to catch.
  it("sees through the quote characters the rules are typeset with", () => {
    const lifted = {
      ...ok,
      short: "Certain spells and abilities have the text \"the Ring tempts you.\" Each time " +
        "the Ring tempts you, choose a creature.",
    };
    expect(() => checkOriginal(doc(lifted), rules)).toThrow(/consecutive words/);
  });

  it("leaves a short definition alone even when every word of it is in the rules", () => {
    expect(() => checkOriginal(doc({ ...ok, short: "Choose a creature you control." }), rules))
      .not.toThrow();
  });
});
