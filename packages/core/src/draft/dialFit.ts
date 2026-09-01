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
//
// IT IS MEASURED NOW. See DRAFTER_TAU below.

import { DIAL_BUNDLES, NEUTRAL_DIALS, type DialPick } from "./dials.js";

export type { DialPick };

/**
 * How far apart real drafters are, and where the number came from.
 *
 * 0.229, maximising the marginal likelihood over 370,325 real 17Lands drafters
 * across all eighteen cached sets, 15.2M picks, each set's population centred on
 * its own pooled theta. `pnpm measure-tau` is the run.
 *
 * The maximum is sharp rather than nominal -- the summed marginal is 2,741
 * below its best at tau 0.20 and 13,748 below at 0.30, so this is a number the
 * data chose rather than one it tolerated.
 *
 * WHAT IT IS NOT
 *
 * It is not one number for every population. Per set it runs 0.151 (ktk) to
 * 0.362 (mh3), and that spread is not noise: mh3 is a Modern Horizons format
 * and drafters really do disagree with each other more in it. A per-set tau is
 * available and deliberately not used yet -- the pooled one is what a player
 * drafting a set nobody has measured has to be shrunk by, which is the same
 * argument `fit-bot-policy` makes for one global policy instead of eighteen.
 *
 * Drafters who go 3-0 come in at 0.211 against the field's 0.229: slightly more
 * alike than everybody else, which is the third time this data has said the same
 * thing -- see the top-1 note under FITTED_POLICIES.
 *
 * AND IT IS MEASURED IN A ROOM THIS APP DOES NOT HAVE. These drafters sat at
 * tables of humans; the app's players sit at tables of pods, whose wheel differs
 * from a real one by 0.27-0.41 in `bench-packs`. `openness` is computed over
 * packs somebody else passed, so this is carried across that gap.
 */
export const DRAFTER_TAU = 0.229;

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

/**
 * The same picks as ONE dial, read straight off the stored curvature.
 *
 * The collapsed feature is the sum of the bundle scores, and at theta = 1 both
 * models put the same probability on every card -- so the one-dimensional
 * gradient is the row sum of this gradient and its Hessian is the full sum of
 * this Hessian. No rows are needed, which is what keeps the whole readout inside
 * the twenty-seven numbers a draft is stored as.
 */
export function collapseCurvature(curvature: DialCurvature): DialCurvature {
  const n = curvature.gradient.length;
  let hessian = 0;
  for (let b = 0; b < n; b++) {
    for (let c = b; c < n; c++) {
      // Off-diagonals twice: the stored triangle is half of a symmetric matrix
      // and the variance of a sum wants both halves.
      hessian += curvature.hessian[triangleIndex(n, b, c)] * (b === c ? 1 : 2);
    }
  }
  return {
    picks: curvature.picks,
    logLik: curvature.logLik,
    gradient: [curvature.gradient.reduce((a, b) => a + b, 0)],
    hessian: [hessian],
  };
}

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
export function dialStep(
  curvature: DialCurvature,
  tau: number,
  centre: readonly number[] = NEUTRAL_DIALS,
): DialEstimate {
  const n = curvature.gradient.length;
  const precision = new Array((n * (n + 1)) / 2);
  const ridge = 1 / (tau * tau);
  for (let b = 0; b < n; b++) {
    for (let c = b; c < n; c++) {
      const at = triangleIndex(n, b, c);
      precision[at] = -curvature.hessian[at] + (b === c ? ridge : 0);
    }
  }

  // The prior pulls toward `centre`, which is not always 1 -- see `fitDrafter`.
  // At theta = 1 that contributes (centre - 1)/tau^2 to the gradient, and the
  // stored curvature is unchanged by where the prior sits.
  const gradient = curvature.gradient.map((g, b) => g + (centre[b] - 1) * ridge);
  const step = solveSymmetric(precision, gradient, n);
  const variance = invertSymmetric(precision, n);

  return {
    theta: step.map((d) => 1 + d),
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
  centre: readonly number[] = NEUTRAL_DIALS,
  steps = 12,
): DialEstimate {
  const n = DIAL_BUNDLES.length;
  let theta = [...centre];

  for (let step = 0; step < steps; step++) {
    const curvature = curvatureAt(picks, theta);
    const precision = new Array((n * (n + 1)) / 2);
    const ridge = 1 / (tau * tau);
    const gradient = curvature.gradient.map((g, b) => g - (theta[b] - centre[b]) * ridge);
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

/**
 * What a drafter is, in the two stages the measurement forces.
 *
 * ONE PRIOR CENTRED AT ONE IS WRONG, AND THE HARNESS IS WHAT SAID SO
 *
 * Shrinking every dial toward 1 assumes a drafter's consistency is the pod's.
 * `fit-drafter` dealt one who is uniformly TWICE as decisive -- the same
 * preferences, sharper -- and the six dials came back at 1.32, 1.45, 1.43, 1.41,
 * 1.08 and 1.01, with `table`, `lane` and `signal` called different from the pod
 * at 100%. Three separate claims that this person weighs something more than the
 * field, about somebody who weighs nothing differently at all.
 *
 * The cause is not the shrinkage being too strong, it is the shrinkage being
 * EVEN. The prior pulls every dial toward 1 with the same force while their
 * curvatures differ by two orders of magnitude, so a bundle the packs argue
 * about lands near the truth and one they do not stays at 1 -- and dividing the
 * six by a separately fitted sharpness afterwards does not undo it, because they
 * were never scaled together in the first place.
 *
 * So sharpness is fitted first and the dials are shrunk toward THAT. The
 * question each dial then answers is the one worth asking -- what does this
 * person weigh, relative to themselves -- and a drafter who is merely decisive
 * comes back at one across the board, which is the truth about them.
 */
export interface DrafterFit {
  /** How consistently they pick, against the pod's 1. */
  sharpness: number;
  sharpnessSe: number;
  /** The dials as fitted, on the pod's own scale. */
  theta: number[];
  se: number[];
  /** What they weigh relative to themselves, which is what a reader wants. */
  relative: number[];
  relativeSe: number[];
  picks: number;
}

const relativeTo = (fit: DialEstimate, sharp: DialEstimate, picks: number): DrafterFit => {
  const sharpness = sharp.theta[0];
  // The interval on a ratio, ignoring the covariance between the two fits. Fine
  // while sharpness is the better-determined of the two by an order of
  // magnitude -- one parameter against six on the same picks -- and something
  // the recovery run has to keep checking rather than assume.
  const scale = Math.abs(sharpness) < 1e-6 ? 1 : Math.abs(sharpness);
  return {
    sharpness,
    sharpnessSe: sharp.se[0],
    theta: fit.theta,
    se: fit.se,
    relative: fit.theta.map((t) => t / (sharpness || 1)),
    relativeSe: fit.se.map((s) => s / scale),
    picks,
  };
};

/** The whole readout from a drafter's stored curvature, and nothing else. */
export function drafterFromCurvature(curvature: DialCurvature, tau: number): DrafterFit {
  const sharp = dialStep(collapseCurvature(curvature), tau);
  const centre = curvature.gradient.map(() => sharp.theta[0]);
  return relativeTo(dialStep(curvature, tau, centre), sharp, curvature.picks);
}

/** The same thing iterated off the rows, which is what the stored path is checked against. */
export function drafterFrom(picks: readonly DialPick[], tau: number): DrafterFit {
  const sharp = fitSharpness(picks, tau);
  const centre = DIAL_BUNDLES.map(() => sharp.theta[0]);
  return relativeTo(fitDials(picks, tau, centre), sharp, sharp.picks);
}

// ------------------------------------------------------------------------ tau
//
// HOW FAR APART REAL DRAFTERS ARE, WHICH IS THE ONE NUMBER THE FIT ASSUMES
//
// Everything above shrinks a drafter toward the pod by `tau`, and until now
// every caller has passed its own and said where it came from -- which is to
// say nowhere. `tau` is not a smoothing preference: it is the standard
// deviation of theta across real drafters, and getting it wrong tilts every
// interval and every draft count the harness reports.
//
// It is also measurable off data already on disk. The 17Lands draft datasets
// are tens of thousands of real drafters, each with their own theta, and
// `table3` was fitted on exactly that population -- so their mean theta is 1 by
// construction and what is left to estimate is their SPREAD.
//
// NOT BY FITTING EACH DRAFTER AND TAKING THE VARIANCE
//
// The obvious estimator is the between-drafter variance of theta-hat minus the
// mean sampling variance, and it goes wrong here for a reason specific to this
// model: `rare` and `removal` carry almost no information, so their
// unpenalised theta-hat is enormous and their sampling variance is enormous,
// and the estimate is a difference of two large noisy numbers. On the dials
// that matter it would work; on the ones that do not it would produce a tau
// dominated by columns nobody can measure.
//
// The marginal likelihood has no such problem. Integrating theta out under the
// prior, a drafter whose picks say nothing about a dial contributes nothing to
// the estimate of tau along it -- not a large noisy contribution, none -- which
// is the same property that makes the prior return exactly itself in `dialStep`.

/**
 * How much better a drafter's picks are explained by allowing theta to vary,
 * against holding it at the pod, for one `tau`.
 *
 * The Laplace marginal of the quadratic, with the constant `logLik` dropped
 * because it is the same for every tau and cancels out of the search:
 *
 *   log m(tau) = logLik + 1/2 g' (I + tau^-2 E)^-1 g - 1/2 log det(E + tau^2 I)
 *
 * where I is the observed information -H and E is the identity. The first term
 * is the evidence for moving, the second is the price of being allowed to.
 */
export function marginalGain(
  curvature: DialCurvature,
  tau: number,
  centre: readonly number[] = NEUTRAL_DIALS,
): number {
  const n = curvature.gradient.length;
  const ridge = 1 / (tau * tau);
  const information = new Array((n * (n + 1)) / 2);
  const penalised = new Array((n * (n + 1)) / 2);

  for (let b = 0; b < n; b++) {
    for (let c = b; c < n; c++) {
      const at = triangleIndex(n, b, c);
      const value = -curvature.hessian[at];
      information[at] = (b === c ? 1 : 0) + tau * tau * value;
      penalised[at] = value + (b === c ? ridge : 0);
    }
  }

  // The gradient as seen FROM the prior's centre rather than from the pod. The
  // curvature is still the one stored at theta = 1 -- only the point the spread
  // is measured around moves, and shifting a quadratic's expansion point is
  // exactly this subtraction.
  const offset = curvature.gradient.map((g, b) => {
    let shifted = g;
    for (let c = 0; c < n; c++) {
      const at = b <= c ? triangleIndex(n, b, c) : triangleIndex(n, c, b);
      shifted -= -curvature.hessian[at] * (centre[c] - 1);
    }
    return shifted;
  });

  const solved = solveSymmetric(penalised, offset, n);
  let quadratic = 0;
  for (let b = 0; b < n; b++) quadratic += offset[b] * solved[b];

  const L = cholesky(information, n);
  let logDet = 0;
  for (let b = 0; b < n; b++) logDet += 2 * Math.log(L[b * n + b]);

  return 0.5 * quadratic - 0.5 * logDet;
}

export interface TauFit {
  tau: number;
  /** Summed marginal gain at the maximum, over the drafters supplied. */
  gain: number;
  drafters: number;
}

/**
 * The tau that best explains a population of drafters.
 *
 * A one-dimensional search, on the log of tau because the quantity is a scale
 * and a grid in tau spends most of its points on values nobody would use.
 * Golden section rather than a derivative: the objective is a sum over tens of
 * thousands of Cholesky factorisations and its derivative is a second one.
 */
export function fitTau(
  curvatures: readonly DialCurvature[],
  centre: readonly number[] = NEUTRAL_DIALS,
  low = 0.01,
  high = 3,
  steps = 60,
): TauFit {
  return fitTauGrouped([{ curvatures, centre }], low, high, steps);
}

/**
 * One tau over several populations that do not share a centre.
 *
 * WHICH IS EVERY REAL POPULATION, AND THE MEASUREMENT SAID SO
 *
 * The average drafter in one set sits well away from `table3` -- `power` pools
 * to 0.30 in ktk and 1.46 in blb, against a tau of about a quarter -- because
 * `table3` is a compromise across eighteen sets and no single set is the
 * compromise. Fitted with the prior at the pod, each set's own offset is
 * counted as spread, and the answer comes back inflated by an amount the same
 * size as the thing being measured.
 *
 * Trap #24 again, one level up: shrink toward the wrong centre and the distance
 * to it is reported as a property of the population.
 */
export function fitTauGrouped(
  groups: readonly { curvatures: readonly DialCurvature[]; centre: readonly number[] }[],
  low = 0.01,
  high = 3,
  steps = 60,
): TauFit {
  const total = (tau: number) => {
    let sum = 0;
    for (const group of groups) {
      for (const c of group.curvatures) sum += marginalGain(c, tau, group.centre);
    }
    return sum;
  };
  const drafters = groups.reduce((n, g) => n + g.curvatures.length, 0);

  const phi = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(low);
  let b = Math.log(high);
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = total(Math.exp(c));
  let fd = total(Math.exp(d));

  for (let i = 0; i < steps && b - a > 1e-4; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = total(Math.exp(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = total(Math.exp(d));
    }
  }

  const tau = Math.exp((a + b) / 2);
  return { tau, gain: total(tau), drafters };
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
