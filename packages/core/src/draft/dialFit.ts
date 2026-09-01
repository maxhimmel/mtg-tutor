// Estimating one drafter's dials from their own picks.
//
// THE SAME LIKELIHOOD `fit-bot-policy` MAXIMISES, WITH TWO DIFFERENCES
//
// It is a conditional logit over the pack: the candidates are the cards that
// were on offer, the label is the one taken, and each candidate scores as a dot
// product. What changes is the width and the null.
//
// The width is `DIAL_BUNDLES.length` rather than ten, because a person brings
// forty-two decisions and the population brings half a million -- see the header
// of `dials.ts` for why that forces bundles.
//
// The null is theta = 1 rather than w = 0, because a drafter is being measured
// against a pod rather than against nothing. That is not presentation: it is
// where the gradient is evaluated, where the prior is centred, and what makes a
// single Newton step meaningful below.
//
// NO FEATURE SCALING, WHICH THE TEN-COLUMN FIT NEEDS AND THIS DOES NOT
//
// `fit-bot-policy` divides each column by its standard deviation because its
// features run from ~0.1 to 1 and one step size cannot serve both. A bundle
// score is already multiplied by its fitted weight, so every column here is in
// logit units and directly comparable -- which is the same property that lets
// `bundleSpread` compare bundles to each other.
//
// WHY A PRIOR, AND WHY IT IS NOT A TUNING KNOB
//
// Forty-two picks against six parameters will produce a maximum-likelihood
// estimate somewhere, and on a draft where a drafter never once took the
// off-colour card it will produce one at infinity. So the estimate is shrunk
// toward the pod: theta ~ Normal(1, tau^2). `tau` is not a smoothing preference,
// it is a claim about HOW DIFFERENT REAL DRAFTERS ARE from each other, and it is
// measurable from the 17Lands drafts already on disk -- fit every drafter,
// subtract the mean sampling variance from the between-drafter variance. Until
// that measurement exists, every caller passes its own tau and says where it
// came from.
//
// The shrinkage also disposes of the unidentifiable bundles for free and in the
// right direction. A dial the packs cannot move contributes nothing to the
// curvature, so the posterior hands back exactly the prior: theta = 1, with the
// prior's own width as the interval. "We could not tell" arrives looking like
// what it is, rather than as a confident zero.

import { DIAL_BUNDLES, NEUTRAL_DIALS } from "./dials.js";

/** One decision: what was on offer, in bundle scores, and which one was taken. */
export interface DialPick {
  bundles: readonly (readonly number[])[];
  chosen: number;
}

/**
 * The log-likelihood and its two derivatives at one point.
 *
 * THIS IS ALSO THE STORAGE FORMAT, WHICH IS THE REASON IT IS A TYPE.
 *
 * Evaluated at theta = 1, a draft's whole contribution to a drafter's estimate
 * is these few numbers: `DIAL_BUNDLES.length` for the gradient and
 * n(n+1)/2 for the Hessian -- twenty-seven in total at six bundles. A draft is
 * ~600 candidate rows, so keeping the curvature instead of the rows is the
 * difference between re-reading every pick of every draft on every read and
 * reading twenty-seven numbers per draft.
 *
 * Curvatures ADD, exactly, because a log-likelihood over independent picks is a
 * sum -- so a new draft updates the estimate without re-reading an old one.
 * What that buys is only exact for a quadratic, which is why `fitDials` iterates
 * and something has to check the two agree. See `dialStep` below.
 */
export interface DialCurvature {
  picks: number;
  logLik: number;
  /** d logLik / d theta, one per bundle. */
  gradient: number[];
  /** d2 logLik / d theta d theta', upper triangle, row-major. Negative definite. */
  hessian: number[];
}

const triangleIndex = (n: number, i: number, j: number) =>
  // Row-major upper triangle: skip the i complete rows above, then j - i in.
  (i * (2 * n - i + 1)) / 2 + (j - i);

/** The log-likelihood, gradient and Hessian of a set of picks at one theta. */
export function curvatureAt(
  picks: readonly DialPick[],
  theta: readonly number[],
): DialCurvature {
  const n = theta.length;
  const gradient = new Array(n).fill(0);
  const hessian = new Array((n * (n + 1)) / 2).fill(0);
  const mean = new Array(n).fill(0);
  let logLik = 0;
  let counted = 0;

  for (const pick of picks) {
    const size = pick.bundles.length;
    // A pack with one card offered no decision, so it carries no information
    // about preferences -- and `isDecisionPick` keeps them out further up for
    // the same reason. Counted as skipped rather than silently included at
    // probability one, which would inflate the likelihood with certainties
    // nobody chose.
    if (size < 2) continue;
    counted++;

    let max = -Infinity;
    const scores = new Float64Array(size);
    for (let j = 0; j < size; j++) {
      let u = 0;
      for (let b = 0; b < n; b++) u += theta[b] * pick.bundles[j][b];
      scores[j] = u;
      if (u > max) max = u;
    }

    let denom = 0;
    for (let j = 0; j < size; j++) {
      scores[j] = Math.exp(scores[j] - max);
      denom += scores[j];
    }

    const chosen = pick.bundles[pick.chosen];
    logLik += Math.log(Math.max(1e-300, scores[pick.chosen] / denom));

    mean.fill(0);
    for (let j = 0; j < size; j++) {
      const p = scores[j] / denom;
      for (let b = 0; b < n; b++) mean[b] += p * pick.bundles[j][b];
    }
    for (let b = 0; b < n; b++) gradient[b] += chosen[b] - mean[b];

    // -Cov_p(s_b, s_b'), which is negative semi-definite for every pick, so the
    // sum is too and the solve below never meets a saddle.
    for (let j = 0; j < size; j++) {
      const p = scores[j] / denom;
      const row = pick.bundles[j];
      for (let b = 0; b < n; b++) {
        for (let c = b; c < n; c++) {
          hessian[triangleIndex(n, b, c)] -= p * (row[b] - mean[b]) * (row[c] - mean[c]);
        }
      }
    }
  }

  return { picks: counted, logLik, gradient, hessian };
}

/** A draft's whole contribution to a drafter, evaluated where the prior sits. */
export const dialCurvature = (picks: readonly DialPick[]): DialCurvature =>
  curvatureAt(picks, NEUTRAL_DIALS);

/** Curvatures add, which is what lets a drafter's estimate be kept per draft. */
export function addCurvature(a: DialCurvature, b: DialCurvature): DialCurvature {
  if (a.gradient.length !== b.gradient.length) {
    throw new Error(
      `cannot pool curvatures of ${a.gradient.length} and ${b.gradient.length} dials -- ` +
        `they were computed against different bundles, so their columns mean different things.`,
    );
  }
  return {
    picks: a.picks + b.picks,
    logLik: a.logLik + b.logLik,
    gradient: a.gradient.map((g, i) => g + b.gradient[i]),
    hessian: a.hessian.map((h, i) => h + b.hessian[i]),
  };
}

export const poolCurvature = (all: readonly DialCurvature[]): DialCurvature =>
  all.reduce(addCurvature, emptyCurvature(DIAL_BUNDLES.length));

export const emptyCurvature = (n: number): DialCurvature => ({
  picks: 0,
  logLik: 0,
  gradient: new Array(n).fill(0),
  hessian: new Array((n * (n + 1)) / 2).fill(0),
});

/** What the fit says, and how much of it is worth saying. */
export interface DialEstimate {
  theta: number[];
  /** Posterior standard deviation per dial, off the same curvature. */
  se: number[];
  picks: number;
  logLik: number;
}

/**
 * One Newton step from the pod, with the prior in it.
 *
 * theta = 1 + (-H + I/tau^2)^-1 g, and the interval off the same inverse. At
 * theta = 1 the prior contributes nothing to the gradient, which is why this
 * reads as cleanly as it does -- the whole penalty shows up in the curvature.
 *
 * Exact for a quadratic log-likelihood and approximate for this one. Whether
 * the approximation is good enough to STORE -- twenty-seven numbers a draft
 * against six hundred rows -- is a measurement rather than a hope, and
 * `fit-drafter --step` is where it gets made.
 */
export function dialStep(curvature: DialCurvature, tau: number): DialEstimate {
  const n = curvature.gradient.length;
  const precision = new Array((n * (n + 1)) / 2);
  const ridge = 1 / (tau * tau);
  for (let b = 0; b < n; b++) {
    for (let c = b; c < n; c++) {
      const at = triangleIndex(n, b, c);
      precision[at] = -curvature.hessian[at] + (b === c ? ridge : 0);
    }
  }

  const step = solveSymmetric(precision, curvature.gradient, n);
  const variance = invertSymmetric(precision, n);

  return {
    theta: step.map((d, b) => NEUTRAL_DIALS[b] + d),
    se: Array.from({ length: n }, (_, b) => Math.sqrt(Math.max(0, variance[triangleIndex(n, b, b)]))),
    picks: curvature.picks,
    logLik: curvature.logLik,
  };
}

/**
 * The full penalised fit, iterated to convergence.
 *
 * The reference `dialStep` is checked against, and the thing a script runs when
 * it has the rows in hand anyway. Newton rather than gradient descent because
 * the Hessian is six by six and already computed -- there is no step size to
 * choose and nothing to tune.
 */
export function fitDials(
  picks: readonly DialPick[],
  tau: number,
  steps = 12,
): DialEstimate {
  const n = DIAL_BUNDLES.length;
  let theta = [...NEUTRAL_DIALS];

  for (let step = 0; step < steps; step++) {
    const curvature = curvatureAt(picks, theta);
    const precision = new Array((n * (n + 1)) / 2);
    const ridge = 1 / (tau * tau);
    const gradient = curvature.gradient.map((g, b) => g - (theta[b] - NEUTRAL_DIALS[b]) * ridge);
    for (let b = 0; b < n; b++) {
      for (let c = b; c < n; c++) {
        const at = triangleIndex(n, b, c);
        precision[at] = -curvature.hessian[at] + (b === c ? ridge : 0);
      }
    }
    const delta = solveSymmetric(precision, gradient, n);
    theta = theta.map((t, b) => t + delta[b]);
    if (delta.every((d) => Math.abs(d) < 1e-10)) break;
  }

  const final = curvatureAt(picks, theta);
  const precision = new Array((n * (n + 1)) / 2);
  const ridge = 1 / (tau * tau);
  for (let b = 0; b < n; b++) {
    for (let c = b; c < n; c++) {
      const at = triangleIndex(n, b, c);
      precision[at] = -final.hessian[at] + (b === c ? ridge : 0);
    }
  }
  const variance = invertSymmetric(precision, n);

  return {
    theta,
    se: Array.from({ length: n }, (_, b) => Math.sqrt(Math.max(0, variance[triangleIndex(n, b, b)]))),
    picks: final.picks,
    logLik: final.logLik,
  };
}

/**
 * The same picks as ONE dial, which is how consistently somebody picks.
 *
 * THE CONFOUND THIS EXISTS TO SEPARATE, WHICH IS NOT A NUISANCE
 *
 * A conditional logit is not invariant to a global scale -- multiplying every
 * weight by c is exactly a temperature change -- so the common direction of the
 * six dials IS sharpness. A drafter who is simply less consistent than the field
 * comes back with every dial shrunk toward zero, and read one at a time that
 * says they care less about power, and less about their lane, and less about
 * signals. It says nothing of the kind.
 *
 * So sharpness is fitted on its own, as a one-parameter model over the pod's own
 * total score, where it is very well determined; the six dials are then read
 * RELATIVE to it. And it is a readout in its own right rather than a correction:
 * `FITTED_POLICIES` records that drafters who go 3-0 are more predictable than
 * the field, 49.9% against 48.2% held-out top-1, which is this quantity seen
 * from the population's side.
 */
export function collapseToSharpness(picks: readonly DialPick[]): DialPick[] {
  return picks.map((pick) => ({
    chosen: pick.chosen,
    bundles: pick.bundles.map((card) => [card.reduce((a, b) => a + b, 0)]),
  }));
}

export function fitSharpness(picks: readonly DialPick[], tau: number, steps = 12): DialEstimate {
  const collapsed = collapseToSharpness(picks);
  let sigma = 1;

  for (let step = 0; step < steps; step++) {
    const curvature = curvatureAt(collapsed, [sigma]);
    const ridge = 1 / (tau * tau);
    const gradient = curvature.gradient[0] - (sigma - 1) * ridge;
    const precision = -curvature.hessian[0] + ridge;
    const delta = gradient / precision;
    sigma += delta;
    if (Math.abs(delta) < 1e-12) break;
  }

  const final = curvatureAt(collapsed, [sigma]);
  const precision = -final.hessian[0] + 1 / (tau * tau);
  return {
    theta: [sigma],
    se: [Math.sqrt(1 / precision)],
    picks: final.picks,
    logLik: final.logLik,
  };
}

// ------------------------------------------------------------ linear algebra
//
// Six by six at most, and symmetric positive definite by construction: the
// Hessian of a conditional logit is negative semi-definite and the prior adds
// 1/tau^2 to every diagonal. So Cholesky is enough and there is no pivoting
// question to get wrong.

function cholesky(upper: readonly number[], n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = upper[triangleIndex(n, j, i)];
      for (let k = 0; k < j; k++) sum -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (sum <= 0) {
          throw new Error(
            `the dial precision matrix is not positive definite at ${i}, which cannot happen ` +
              `with a real prior -- tau is zero, infinite, or the curvature did not come from ` +
              `curvatureAt.`,
          );
        }
        L[i * n + j] = Math.sqrt(sum);
      } else {
        L[i * n + j] = sum / L[j * n + j];
      }
    }
  }
  return L;
}

function solveSymmetric(upper: readonly number[], b: readonly number[], n: number): number[] {
  const L = cholesky(upper, n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i * n + k] * y[k];
    y[i] = sum / L[i * n + i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k * n + i] * x[k];
    x[i] = sum / L[i * n + i];
  }
  return x;
}

/** The inverse, as an upper triangle, for the diagonal the intervals read. */
function invertSymmetric(upper: readonly number[], n: number): number[] {
  const out = new Array((n * (n + 1)) / 2).fill(0);
  for (let column = 0; column < n; column++) {
    const unit = new Array(n).fill(0);
    unit[column] = 1;
    const solved = solveSymmetric(upper, unit, n);
    for (let row = 0; row <= column; row++) out[triangleIndex(n, row, column)] = solved[row];
  }
  return out;
}
