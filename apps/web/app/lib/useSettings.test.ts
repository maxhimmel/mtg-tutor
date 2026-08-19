import { describe, it, expect } from "vitest";
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

describe("storedSettings", () => {
  const stored = (v: Record<string, unknown>) => storedSettings(JSON.stringify(v));

  // The three retired rungs, and the point is that none of them comes back
  // unchanged. Before this, [2, 3, 5, 7, 9] was offered and everyone who had
  // ever opened the control is carrying one of them.
  it("snaps a retired coach threshold to the nearest offered one", () => {
    expect(stored({ coachMinPackCards: 3 }).coachMinPackCards).toBe(2);
    expect(stored({ coachMinPackCards: 5 }).coachMinPackCards).toBe(4);
    expect(stored({ coachMinPackCards: 7 }).coachMinPackCards).toBe(6);
    expect(stored({ coachMinPackCards: 9 }).coachMinPackCards).toBe(8);
  });

  // Ties go to the rung that coaches MORE, which is the smaller number. Every
  // retired value sat exactly between two offered ones, so this is not an edge
  // case here -- it is the whole migration.
  it("breaks a tie toward more coaching, not less", () => {
    expect(stored({ coachMinPackCards: 5 }).coachMinPackCards).toBeLessThan(5);
  });

  it("leaves an offered threshold alone", () => {
    for (const rung of COACH_THRESHOLDS) {
      expect(stored({ coachMinPackCards: rung.id }).coachMinPackCards).toBe(rung.id);
    }
  });

  // Out of range in both directions, from a hand-edited blob or a future list
  // that trims its ends. Clamps to an end rather than falling through to the
  // default, because "as much coaching as possible" is still what was asked for.
  it("clamps a threshold from outside the ladder", () => {
    expect(stored({ coachMinPackCards: 1 }).coachMinPackCards).toBe(2);
    expect(stored({ coachMinPackCards: 99 }).coachMinPackCards).toBe(10);
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
