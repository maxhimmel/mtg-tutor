import { describe, expect, it } from "vitest";
import { gradeFor } from "@mtg-tutor/core";

import { GRADE_BANDS, scoreAxis } from "./plot";

describe("grade bands", () => {
  // Read off gradeFor rather than transcribed, so this is the assertion that
  // the reading is faithful -- and the one that fails if a band ever moves and
  // the derivation stops finding it.
  it("names the lowest score that earns each grade", () => {
    for (const band of GRADE_BANDS) {
      expect(gradeFor(band.floor)).toBe(band.grade);
      if (band.floor > 0) expect(gradeFor(band.floor - 1)).not.toBe(band.grade);
    }
  });
});

describe("the axis", () => {
  it("stands on a grade threshold rather than on the data", () => {
    const floors = GRADE_BANDS.map((band) => band.floor);
    for (const values of [[88.2], [61, 74.5], [12], [99.9], [45]]) {
      expect(floors).toContain(scoreAxis(values).floor);
    }
  });

  // The whole reason the floor is strictly below the lowest value: a column with
  // no height reads as a draft that had no score, not as one that scored least.
  it("leaves the smallest value a column to stand up in", () => {
    for (const values of [[88.2, 91], [75, 75], [45], [90]]) {
      const axis = scoreAxis(values);
      expect(axis.at(Math.min(...values))).toBeGreaterThan(0);
    }
  });

  it("puts a perfect score at the top and clamps anything outside", () => {
    const axis = scoreAxis([80]);
    expect(axis.at(100)).toBe(1);
    expect(axis.at(1000)).toBe(1);
    expect(axis.at(-1)).toBe(0);
  });

  it("draws only the thresholds that fall inside the plot", () => {
    const axis = scoreAxis([88.2, 92.4]);
    expect(axis.floor).toBe(83);
    expect(axis.bands.map((band) => band.floor)).toEqual([90, 97]);
  });

  // A player whose worst average is an F has nothing below them, and the axis
  // has to stand somewhere.
  it("falls back to zero when there is no threshold beneath the data", () => {
    expect(scoreAxis([0]).floor).toBe(0);
  });
});
