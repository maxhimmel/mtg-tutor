import { describe, expect, it } from "vitest";
import { mulberry32 } from "../util/rng.js";
import { DIAL_BUNDLES, NEUTRAL_DIALS } from "./dials.js";
import {
  addCurvature,
  collapseCurvature,
  collapseToSharpness,
  curvatureAt,
  dialCurvature,
  DRAFTER_TAU,
  dialStep,
  drafterFrom,
  drafterFromCurvature,
  fitDials,
  fitSharpness,
  fitTau,
  marginalGain,
  rebaseCurvature,
  type DialPick,
} from "./dialFit.js";

// The derivatives are the whole file: the estimate, the interval and the stored
// twenty-seven numbers a draft are all read off them, and an index slipped in
// the packed triangle would produce a fit that converges to a confident wrong
// answer. So they are checked against finite differences of the likelihood they
// claim to differentiate, which is the one test that cannot agree by
// construction.

const N = DIAL_BUNDLES.length;

/** Packs of random bundle scores, on the scale real ones come out at. */
function randomPicks(count: number, seed = 7, size = 12): DialPick[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    bundles: Array.from({ length: size }, () =>
      Array.from({ length: N }, () => (rng() - 0.5) * 2),
    ),
    chosen: Math.floor(rng() * size),
  }));
}

// How far apart the bundles are in how much they move a pack, measured off real
// fdn packs by `fit-drafter`: table 4.10, lane 0.94, power 0.79, signal 0.42,
// rare 0.029, removal 0.011. Two orders of magnitude between the ends, and that
// gap is not decoration -- an even prior shrinks a wide bundle and a narrow one
// by wildly different amounts, which is the whole reason the fit has two stages.
// Synthetic picks with equal spreads cannot reproduce it, and a test built on
// those would report the pathology as fixed while it was merely invisible.
const SPREAD = [0.79, 4.1, 0.94, 0.42, 0.029, 0.011].slice(0, N);

/** Deals picks FROM a known theta, so a fit has something true to recover. */
function picksFrom(
  theta: readonly number[],
  count: number,
  seed = 11,
  size = 12,
  spread: readonly number[] = new Array(N).fill(1),
): DialPick[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const bundles = Array.from({ length: size }, () =>
      Array.from({ length: N }, (_, b) => (rng() - 0.5) * 2 * spread[b]),
    );
    const scores = bundles.map((card) => card.reduce((u, s, b) => u + theta[b] * s, 0));
    const max = Math.max(...scores);
    const weights = scores.map((s) => Math.exp(s - max));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let chosen = 0;
    for (let j = 0; j < weights.length; j++) {
      roll -= weights[j];
      if (roll <= 0) {
        chosen = j;
        break;
      }
    }
    return { bundles, chosen };
  });
}

describe("the derivatives are the likelihood's", () => {
  const picks = randomPicks(60, 3);
  const theta = [1.3, 0.7, 1.1, 0.9, 1.05, 0.95].slice(0, N);
  const at = curvatureAt(picks, theta);
  const h = 1e-5;

  it("matches a finite-difference gradient", () => {
    for (let b = 0; b < N; b++) {
      const up = [...theta];
      const down = [...theta];
      up[b] += h;
      down[b] -= h;
      const numeric =
        (curvatureAt(picks, up).logLik - curvatureAt(picks, down).logLik) / (2 * h);
      expect(at.gradient[b]).toBeCloseTo(numeric, 5);
    }
  });

  it("matches a finite-difference Hessian, including every off-diagonal", () => {
    const triangle = (i: number, j: number) => (i * (2 * N - i + 1)) / 2 + (j - i);

    for (let b = 0; b < N; b++) {
      for (let c = b; c < N; c++) {
        const up = [...theta];
        const down = [...theta];
        up[c] += h;
        down[c] -= h;
        const numeric =
          (curvatureAt(picks, up).gradient[b] - curvatureAt(picks, down).gradient[b]) / (2 * h);
        expect(at.hessian[triangle(b, c)]).toBeCloseTo(numeric, 4);
      }
    }
  });

  it("is negative definite, so the solve never meets a saddle", () => {
    for (let b = 0; b < N; b++) {
      const diagonal = at.hessian[(b * (2 * N - b + 1)) / 2];
      expect(diagonal).toBeLessThan(0);
    }
  });
});

describe("curvatures add", () => {
  it("pools two halves into what the whole would have given", () => {
    const all = randomPicks(40, 5);
    const whole = dialCurvature(all);
    const halves = addCurvature(dialCurvature(all.slice(0, 17)), dialCurvature(all.slice(17)));

    expect(halves.picks).toBe(whole.picks);
    expect(halves.logLik).toBeCloseTo(whole.logLik, 10);
    halves.gradient.forEach((g, i) => expect(g).toBeCloseTo(whole.gradient[i], 10));
    halves.hessian.forEach((v, i) => expect(v).toBeCloseTo(whole.hessian[i], 10));
  });

  it("refuses to pool curvatures of different widths", () => {
    expect(() =>
      addCurvature(dialCurvature(randomPicks(3)), curvatureAt(randomPicks(3), [1])),
    ).toThrow(/different things/);
  });
});

describe("a pick with nothing to choose between", () => {
  it("is not counted, rather than entering at probability one", () => {
    const one: DialPick[] = [{ bundles: [new Array(N).fill(0.4)], chosen: 0 }];
    const curvature = dialCurvature(one);
    expect(curvature.picks).toBe(0);
    expect(curvature.logLik).toBe(0);
  });
});

describe("what the prior does when the picks say nothing", () => {
  // Every candidate identical, so no choice carries information about any dial.
  const flat: DialPick[] = Array.from({ length: 42 }, () => ({
    bundles: Array.from({ length: 10 }, () => new Array(N).fill(0.3)),
    chosen: 3,
  }));

  it("hands back the pod itself", () => {
    const fit = dialStep(dialCurvature(flat), 0.35);
    fit.theta.forEach((t) => expect(t).toBeCloseTo(1, 10));
  });

  it("hands back the prior's own width, so 'we could not tell' looks like it", () => {
    const fit = dialStep(dialCurvature(flat), 0.35);
    fit.se.forEach((s) => expect(s).toBeCloseTo(0.35, 10));
  });
});

describe("recovering a theta the picks were dealt from", () => {
  const truth = [1.6, 0.6, 1.4, 0.7, 1.0, 1.0].slice(0, N);

  it("gets close given plenty of picks", () => {
    const fit = fitDials(picksFrom(truth, 20000, 23), 5);
    fit.theta.forEach((t, b) => expect(t).toBeCloseTo(truth[b], 1));
  });

  it("puts its interval where the answer is", () => {
    const fit = fitDials(picksFrom(truth, 20000, 29), 5);
    fit.theta.forEach((t, b) => {
      expect(Math.abs(t - truth[b])).toBeLessThan(3 * fit.se[b]);
    });
  });

  it("reports a tighter interval the more picks it is given", () => {
    const few = fitDials(picksFrom(truth, 200, 31), 5);
    const many = fitDials(picksFrom(truth, 8000, 31), 5);
    few.se.forEach((s, b) => expect(many.se[b]).toBeLessThan(s));
  });
});

describe("one Newton step against the full fit", () => {
  it("agrees where the deviation is small, which is what licences storing it", () => {
    const picks = picksFrom([1.2, 0.9, 1.1, 0.95, 1.0, 1.0].slice(0, N), 4000, 37);
    const step = dialStep(dialCurvature(picks), 0.4);
    const full = fitDials(picks, 0.4);

    step.theta.forEach((t, b) => expect(t).toBeCloseTo(full.theta[b], 1));
  });
});

describe("sharpness", () => {
  it("is one for a drafter dealt from the pod itself", () => {
    const fit = fitSharpness(picksFrom(NEUTRAL_DIALS, 20000, 41), 5);
    expect(fit.theta[0]).toBeCloseTo(1, 1);
  });

  it("rises for a drafter who is more decisive than the pod", () => {
    const fit = fitSharpness(picksFrom(NEUTRAL_DIALS.map(() => 2), 20000, 43), 5);
    expect(fit.theta[0]).toBeGreaterThan(1.7);
  });

  it("falls toward nothing for a drafter picking at random", () => {
    const fit = fitSharpness(picksFrom(NEUTRAL_DIALS.map(() => 0), 20000, 47), 5);
    expect(Math.abs(fit.theta[0])).toBeLessThan(0.15);
  });

  it("is what the six dials share, so a noisy drafter is not six weak opinions", () => {
    // Every dial halved is one drafter at half sharpness, not a drafter who
    // stopped caring about six separate things.
    const half = picksFrom(
      NEUTRAL_DIALS.map(() => 0.5),
      20000,
      53,
    );
    expect(fitSharpness(half, 5).theta[0]).toBeCloseTo(0.5, 1);
    fitDials(half, 5).theta.forEach((t) => expect(t).toBeCloseTo(0.5, 1));
  });
});

describe("collapseCurvature", () => {
  it("is what the collapsed picks would have given, off the stored numbers alone", () => {
    const picks = randomPicks(50, 61);
    const fromStored = collapseCurvature(dialCurvature(picks));
    const fromRows = curvatureAt(collapseToSharpness(picks), [1]);

    expect(fromStored.gradient[0]).toBeCloseTo(fromRows.gradient[0], 9);
    expect(fromStored.hessian[0]).toBeCloseTo(fromRows.hessian[0], 9);
    expect(fromStored.logLik).toBeCloseTo(fromRows.logLik, 9);
  });
});

describe("a drafter who is only more decisive", () => {
  // The failure the two-stage fit exists for: every dial doubled is one person
  // picking more sharply, not six preferences that all grew.
  // A real drafter's worth of picks -- fifteen drafts -- on bundles as unequal
  // as real packs make them. Both halves matter: at synthetic scale the prior
  // stops mattering and the pathology vanishes on its own.
  const picks = picksFrom(NEUTRAL_DIALS.map(() => 2), 630, 67, 12, SPREAD);

  it("comes back at one across the board, relative to themselves", () => {
    const fit = drafterFrom(picks, 0.35);
    fit.relative.forEach((r) => expect(Math.abs(r - 1)).toBeLessThan(0.25));
  });

  it("has its sharpness in the sharpness, where a reader can see it", () => {
    expect(drafterFrom(picks, 0.35).sharpness).toBeGreaterThan(1.5);
  });

  it("would have been called different on several dials by an even prior", () => {
    // Kept as the contrast, so the reason for two stages cannot quietly rot: a
    // prior centred at 1 shrinks a decisive drafter unevenly, and the dials it
    // leaves furthest from 1 are the ones the packs argue about most.
    const even = fitDials(picks, 0.35);
    expect(Math.max(...even.theta) - Math.min(...even.theta)).toBeGreaterThan(0.3);
    // And the dials furthest from 1 are the ones the packs argue about most.
    expect(even.theta[SPREAD.indexOf(Math.max(...SPREAD))]).toBeGreaterThan(
      even.theta[SPREAD.indexOf(Math.min(...SPREAD))],
    );
  });
});

describe("the stored path against the iterated one", () => {
  it("agrees on a drafter near the pod", () => {
    const picks = picksFrom([1.2, 0.9, 1.1, 0.95, 1.0, 1.0].slice(0, N), 4000, 71);
    const stored = drafterFromCurvature(dialCurvature(picks), 0.35);
    const iterated = drafterFrom(picks, 0.35);

    expect(stored.sharpness).toBeCloseTo(iterated.sharpness, 1);
    stored.relative.forEach((r, b) => expect(r).toBeCloseTo(iterated.relative[b], 1));
  });
});

describe("fitTau", () => {
  // Drafters drawn from a known spread, on bundles as unequal as real packs
  // make them -- the case the estimator has to survive is `rare` and `removal`
  // carrying nothing, where a variance-of-estimates approach would be reading a
  // difference of two large noisy numbers.
  const population = (tau: number, count: number, picks: number, seed: number) => {
    const rng = mulberry32(seed);
    const normal = () => {
      const u = Math.max(1e-12, rng());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    return Array.from({ length: count }, (_, i) => {
      const theta = NEUTRAL_DIALS.map(() => 1 + tau * normal());
      return dialCurvature(picksFrom(theta, picks, seed + i * 7919, 12, SPREAD));
    });
  };

  it("recovers a spread the drafters were drawn from", () => {
    const fit = fitTau(population(0.3, 250, 400, 101));
    expect(fit.tau).toBeGreaterThan(0.2);
    expect(fit.tau).toBeLessThan(0.45);
  });

  it("tells a tight population from a loose one", () => {
    const tight = fitTau(population(0.1, 200, 400, 211)).tau;
    const loose = fitTau(population(0.6, 200, 400, 211)).tau;
    expect(tight).toBeLessThan(loose);
  });

  it("hears nothing from a drafter whose picks carry no information", () => {
    // Every candidate identical: no evidence about theta, so no evidence about
    // its spread either. A variance-of-estimates approach would take a huge
    // theta-hat and a huge sampling variance here and difference them.
    const flat = dialCurvature(
      Array.from({ length: 42 }, () => ({
        bundles: Array.from({ length: 10 }, () => new Array(N).fill(0.3)),
        chosen: 3,
      })),
    );
    for (const tau of [0.1, 0.5, 2]) expect(marginalGain(flat, tau)).toBeCloseTo(0, 12);
  });

  it("prices a wide prior badly when the drafters really are the pod", () => {
    const atPod = Array.from({ length: 200 }, (_, i) =>
      dialCurvature(picksFrom(NEUTRAL_DIALS, 400, 307 + i * 7919, 12, SPREAD)),
    );
    const total = (tau: number) => atPod.reduce((sum, c) => sum + marginalGain(c, tau), 0);
    expect(total(0.05)).toBeGreaterThan(total(1.5));
  });
});

describe("a population that is not at the pod", () => {
  // What the per-set tables turned up: the average drafter in one set sits well
  // away from `table3`, and `power` runs 0.30 in ktk against 1.46 in blb. A tau
  // measured with the prior at 1 would report that offset as spread.
  const OFFSET = [1.4, 1.4, 1.4, 1.4, 1.4, 1.4].slice(0, N);

  const shifted = (tau: number, count: number, picks: number, seed: number) => {
    const rng = mulberry32(seed);
    const normal = () => {
      const u = Math.max(1e-12, rng());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    return Array.from({ length: count }, (_, i) =>
      dialCurvature(
        picksFrom(
          OFFSET.map((o) => o + tau * normal()),
          picks,
          seed + i * 7919,
          12,
          SPREAD,
        ),
      ),
    );
  };

  it("reports the offset as spread when the prior sits at the pod", () => {
    expect(fitTau(shifted(0.15, 150, 400, 401)).tau).toBeGreaterThan(0.3);
  });

  it("and recovers the real spread once the prior is centred on the population", () => {
    const fit = fitTau(shifted(0.15, 150, 400, 401), OFFSET);
    expect(fit.tau).toBeGreaterThan(0.08);
    expect(fit.tau).toBeLessThan(0.28);
  });
});

describe("rebaseCurvature", () => {
  // A set whose drafters sit away from the pod, and a player who is exactly
  // average for it. Measured against the pod they look unusual; measured
  // against their own set they look like everybody else, which is the truth.
  const SET = [1.35, 0.85, 1.1, 0.9, 1.0, 1.0].slice(0, N);

  it("reads an average-for-the-set drafter at one", () => {
    const picks = picksFrom(SET, 8000, 811, 12, SPREAD);
    // At the measured tau rather than a wide one: `rare` and `removal` carry no
    // information, and the prior is what is supposed to hand them back at 1.
    const rebased = rebaseCurvature(dialCurvature(picks), SET);
    const fit = dialStep(rebased, DRAFTER_TAU);
    fit.theta.forEach((t) => expect(Math.abs(t - 1)).toBeLessThan(0.15));
  });

  it("keeps a drafter's own deviation, rather than flattening everyone", () => {
    // Half again on `lane` ON TOP of the set's own habits.
    const lane = DIAL_BUNDLES.findIndex((b) => b.id === "lane");
    const theirs = SET.map((v, b) => (b === lane ? v + 0.5 : v));
    const fit = dialStep(
      rebaseCurvature(dialCurvature(picksFrom(theirs, 8000, 823, 12, SPREAD)), SET),
      DRAFTER_TAU,
    );

    expect(fit.theta[lane]).toBeGreaterThan(1.25);
    fit.theta.forEach((t, b) => {
      if (b !== lane) expect(Math.abs(t - 1)).toBeLessThan(0.2);
    });
  });

  it("leaves the Hessian alone, because a quadratic has one everywhere", () => {
    const c = dialCurvature(randomPicks(30, 829));
    expect(rebaseCurvature(c, SET).hessian).toEqual(c.hessian);
  });

  it("is a no-op against a set that sits at the pod", () => {
    const c = dialCurvature(randomPicks(30, 831));
    rebaseCurvature(c, NEUTRAL_DIALS).gradient.forEach((g, b) =>
      expect(g).toBeCloseTo(c.gradient[b], 12),
    );
  });

  it("still adds, so a player in four sets is still a sum of curvatures", () => {
    const OTHER = [0.8, 1.2, 0.95, 1.05, 1.0, 1.0].slice(0, N);
    const a = dialCurvature(picksFrom(SET, 600, 841, 12, SPREAD));
    const b = dialCurvature(picksFrom(OTHER, 600, 853, 12, SPREAD));

    const pooled = addCurvature(rebaseCurvature(a, SET), rebaseCurvature(b, OTHER));
    const fit = dialStep(pooled, 0.229);
    // Two average-for-their-set drafts pooled read as one average player, which
    // against the pod they would not: the two sets pull opposite ways on
    // `power` and `table` and would not cancel at two drafts.
    fit.theta.forEach((t) => expect(Math.abs(t - 1)).toBeLessThan(0.2));
  });
});
