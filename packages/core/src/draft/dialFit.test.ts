import { describe, expect, it } from "vitest";
import { mulberry32 } from "../util/rng.js";
import { DIAL_BUNDLES, NEUTRAL_DIALS } from "./dials.js";
import {
  addCurvature,
  curvatureAt,
  dialCurvature,
  dialStep,
  fitDials,
  fitSharpness,
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

/** Deals picks FROM a known theta, so a fit has something true to recover. */
function picksFrom(theta: readonly number[], count: number, seed = 11, size = 12): DialPick[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const bundles = Array.from({ length: size }, () =>
      Array.from({ length: N }, () => (rng() - 0.5) * 2),
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
