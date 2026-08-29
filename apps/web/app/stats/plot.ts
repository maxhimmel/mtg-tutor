import { gradeFor } from "@mtg-tutor/core";

// The axis every plot on this page is drawn against, and the one decision that
// makes the page readable rather than decorative.
//
// An average pick score does not vary the way a score does. A single pick can be
// anything from 0 to 100, but averaged over a draft -- let alone over every
// draft you have taken -- the answer lands in a band a few points wide, high up.
// Drawn from zero, every column on this page is the same column, and a page of
// identical bars says nothing about the thing it was built to say something
// about. The CLI's version has exactly that problem.
//
// So the axis is zoomed. What stops that being a lie is where it is allowed to
// stop: not at the data's own minimum, which would make any spread look
// enormous, but at a GRADE THRESHOLD -- the floor of the letter below the lowest
// value plotted. The bottom of the plot is therefore a fact about the scoring
// scale rather than a fact about this player's worst week, it does not move when
// one number moves, and it is a line the reader can already read, because the
// same eight thresholds colour every score in the app.
//
// The thresholds are asked of `gradeFor` and never transcribed, for the reason
// the glossary's grade ruler gives: a second copy of the scale disagrees with
// the first the day a band moves.

const TOP = 100;

export interface GradeBand {
  grade: string;
  floor: number;
}

/** Every grade and the lowest score that earns it, highest first. */
export const GRADE_BANDS: GradeBand[] = (() => {
  const bands: GradeBand[] = [];
  for (let score = TOP; score >= 0; score--) {
    const grade = gradeFor(score);
    const last = bands[bands.length - 1];
    if (last?.grade === grade) last.floor = score;
    else bands.push({ grade, floor: score });
  }
  return bands;
})();

export interface ScoreAxis {
  /** The score the plot stands on. Always a grade threshold. */
  floor: number;
  /** The thresholds strictly inside the plot, lowest first -- the gridlines. */
  bands: GradeBand[];
  /**
   * Every grade a column on this plot can land in, highest first.
   *
   * Not the same list as `bands`, and the difference is the one a legend gets
   * wrong. `bands` is the GRIDLINES -- the thresholds strictly inside the plot
   * -- and it leaves out the grade the plot stands on, because that threshold
   * is the floor and drawing a line along the bottom edge says nothing. But
   * that band is a region columns land in, and by construction it is the one
   * the LOWEST column is in. A key built from `bands` would therefore be
   * missing exactly the entry the reader looking at the worst column needs.
   */
  grades: GradeBand[];
  /** Where a score sits between floor and 100, as a fraction. */
  at: (score: number) => number;
}

export function scoreAxis(values: readonly number[]): ScoreAxis {
  const lowest = values.length > 0 ? Math.min(...values) : TOP;
  // Strictly below, so the smallest column still has a body. A floor equal to
  // the lowest value draws it as nothing at all, which reads as missing data.
  const floor = GRADE_BANDS.find((band) => band.floor < lowest)?.floor ?? 0;
  const span = TOP - floor;

  return {
    floor,
    bands: GRADE_BANDS.filter((band) => band.floor > floor).reverse(),
    // `>=`, where `bands` is `>`: the floor's own band is on the plot even
    // though its threshold is not drawn as a line inside it.
    grades: GRADE_BANDS.filter((band) => band.floor >= floor),
    at: (score) => Math.min(Math.max((score - floor) / span, 0), 1),
  };
}
