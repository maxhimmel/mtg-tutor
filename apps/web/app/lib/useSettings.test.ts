import { describe, it, expect } from "vitest";
import { isDecisionPick } from "@mtg-tutor/core";
import {
  COACH_THRESHOLDS,
  DEFAULT_SETTINGS,
  DIFF_LAYOUTS,
  PICK_CEREMONIES,
  PODS,
  storedSettings,
} from "./useSettings";

// There is no DOM harness in this app on purpose (see notes.md, deferred
// trade-off 0a), so what gets tested is the pure half the components read: the
// offered values and the migration. That is enough for this class of bug --
// every one of these failures is a control rendering with nothing pressed,
// which is decided entirely by these two things and not by any event wiring.

describe("every default is an offered value", () => {
  // THE BUG THIS EXISTS FOR. `coachMinPackCards` defaults to
  // `COACH.minPackCards`, the offered rungs were a hand-written [2, 3, 5, 7, 9]
  // in a draft-screen component, and raising the shared floor from 5 to 6 made
  // the default unselectable -- so a new drafter opened the control and found
  // nothing pressed, with no way to press the value they were already on.
  //
  // Written as a loop over every setting rather than as one assertion about the
  // coach, because the defect is structural: a default and its option list are
  // two places that have to agree, and three other settings here have the same
  // shape. Trap #5 in notes.md is the same lesson -- test the class, not the
  // instance that happened to break.
  it("offers the default coach threshold", () => {
    expect(COACH_THRESHOLDS.map((r) => r.id)).toContain(DEFAULT_SETTINGS.coachMinPackCards);
  });

  it("offers the default pick ceremony", () => {
    expect(PICK_CEREMONIES.map((c) => c.id)).toContain(DEFAULT_SETTINGS.pickCeremony);
  });

  it("offers the default diff layout", () => {
    expect(DIFF_LAYOUTS.map((l) => l.id)).toContain(DEFAULT_SETTINGS.diffLayout);
  });

  it("offers the default pod", () => {
    expect(PODS.map((p) => p.id)).toContain(DEFAULT_SETTINGS.pod);
  });
});

// The blurb under the coach control makes an arithmetic claim -- "quiet for the
// last N picks of a pack" -- and the copy and the rule it describes are two
// places that can disagree. This session has already shipped two off-by-ones on
// exactly this boundary, so the sentence is checked against `isDecisionPick`
// itself rather than against a number written down twice.
//
// Both pack shapes, because the claim is that it does not depend on pack size:
// a Play Booster is fourteen cards and the fallback shape is fifteen, and a
// blurb phrased as "coaches the first nine picks" would be wrong on one of them.
describe("the coach blurb counts the picks the rule actually silences", () => {
  const silenced = (threshold: number, packSize: number) =>
    Array.from({ length: packSize }, (_, i) => packSize - i).filter(
      (cardsLeft) => !isDecisionPick(cardsLeft, threshold),
    ).length;

  it("names the same number the rule silences, on either pack shape", () => {
    for (const rung of COACH_THRESHOLDS) {
      for (const packSize of [14, 15]) {
        const quiet = silenced(rung.id, packSize);
        expect(quiet).toBe(rung.id - 1);
        // "the last pick" for one, "the last N picks" for the rest.
        expect(rung.blurb).toContain(quiet === 1 ? "the last pick" : `the last ${quiet} picks`);
      }
    }
  });
});

describe("storedSettings", () => {
  const stored = (v: Record<string, unknown>) => storedSettings(JSON.stringify(v));
  const nearestOf = (n: number) => stored({ coachMinPackCards: n }).coachMinPackCards;

  // Every value anybody could be carrying from either earlier list. [2,3,5,7,9]
  // shipped first and even steps briefly replaced it, so a real drafter's blob
  // holds one of 2,3,4,5,6,7,8,9,10 -- and the range now offers all of them, so
  // the correct answer for every one is to leave it alone. This is the
  // assertion that the migration stopped MOVING people once it no longer had to.
  it("leaves every offered threshold alone", () => {
    for (const rung of COACH_THRESHOLDS) {
      expect(stored({ coachMinPackCards: rung.id }).coachMinPackCards).toBe(rung.id);
    }
  });

  // What is left for it to do, and the reason it stays: the ends. 1 is what the
  // "explain this anyway" button sends and is not a preference; anything above
  // the range is a hand-edited blob or a future list that trims its ceiling.
  // Clamped to an end rather than dropped to the default, because "as much
  // coaching as possible" is still what was asked for.
  it("clamps a threshold from outside the range", () => {
    expect(stored({ coachMinPackCards: 1 }).coachMinPackCards).toBe(2);
    expect(stored({ coachMinPackCards: 99 }).coachMinPackCards).toBe(10);
  });

  // Ties go to the rung that coaches MORE, which is the smaller number. No
  // offered value can tie today -- they are consecutive integers -- so this is
  // guarding the rule for the next time the range is trimmed rather than a case
  // anybody hits, and it is written against a half-step to say so.
  it("breaks a tie toward more coaching, not less", () => {
    expect(nearestOf(5.5)).toBe(5);
  });

  // Absent stays absent. The provider spreads this over the defaults, so a key
  // present carrying anything at all overwrites the default -- which is the
  // reason the layout and pod cases below DELETE rather than assign undefined.
  it("leaves a threshold nobody has set unset", () => {
    expect("coachMinPackCards" in stored({ showStats: false })).toBe(false);
  });

  it("drops a layout and a pod that are no longer offered", () => {
    expect("diffLayout" in stored({ diffLayout: "spine" })).toBe(false);
    expect("pod" in stored({ pod: "legacy" })).toBe(false);
  });

  it("keeps the pre-rename guiderails flag as showStats", () => {
    expect(stored({ guiderails: false }).showStats).toBe(false);
    // Only where the new key is missing: this cannot undo a choice made since.
    expect(stored({ guiderails: false, showStats: true }).showStats).toBe(true);
  });
});
