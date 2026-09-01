import { FITTED_POLICIES } from "./policy.js";
import {
  DIAL_FINGERPRINT,
  DIAL_YARDSTICK,
  dialPicksFrom,
  setBaseline,
  type DraftRow,
} from "./dials.js";
import { dialCurvature, rebaseCurvature, type DialCurvature } from "./dialFit.js";

// What a finished draft carries so a drafter can be read later.
//
// A THIRD FILE, TO KEEP THE OTHER TWO POINTING ONE WAY
//
// `dials.ts` is the model -- what the bundles are, where each set's zero is --
// and knows nothing about estimating anything. `dialFit.ts` is the estimator and
// depends on the model. This needs both, and putting it in either would make
// them import each other. `policy.ts` already spends a paragraph on why a cycle
// whose loser is decided by import order is not a thing to leave lying around,
// and the fix there was the same: let the thing that needs both sides be its own
// file rather than making one side reach back.

/**
 * What a finished draft leaves behind for a drafter's readout.
 *
 * Twenty-eight numbers -- six gradient, twenty-one Hessian, the log-likelihood
 * -- plus the fingerprint that says what they are in the units of. See
 * `DialCurvature` in dialFit.ts for why a draft is stored as its curvature
 * rather than as its rows.
 *
 * At theta = 1, NOT rebased against the set. `DIAL_BASELINES` is refittable by
 * design, and a curvature stored already-corrected would freeze the baseline
 * that happened to be current the day the draft finished -- eighteen sets' worth
 * of drafts each carrying a different vintage of the same correction, with
 * nothing recording which. Rebasing is one subtraction at read time.
 */
export interface StoredDials {
  gradient: number[];
  hessian: number[];
  logLik: number;
  picks: number;
  fingerprint: string;
}

/**
 * A draft's curvature, or nothing if this pool cannot be measured.
 *
 * REFUSES RATHER THAN DEGRADES, which is the whole reason it can return
 * undefined. `policyFeatures` falls `tableValue` back to `value` per card, and
 * that is right: a card the artifact has no pick order for should be scored on
 * what it wins rather than on zero. But a pool ingested before `tableValue`
 * existed has none AT ALL, and there the fallback stops being a graceful
 * per-card default and becomes a whole draft measured on a different column from
 * every other draft -- `table` and `power` would be the same bundle twice, in a
 * player's history, silently.
 *
 * So: some cards without pick order is normal and fine, none is a refusal.
 */
export function dialsForDraft(rows: readonly DraftRow[]): StoredDials | undefined {
  const rated = rows.some((row) => row.pack.some((card) => card.tableValue != null));
  if (!rated) return undefined;

  const picks = dialPicksFrom(rows, FITTED_POLICIES[DIAL_YARDSTICK]);
  const curvature = dialCurvature(picks);
  if (curvature.picks === 0) return undefined;

  return {
    gradient: curvature.gradient,
    hessian: curvature.hessian,
    logLik: curvature.logLik,
    picks: curvature.picks,
    fingerprint: DIAL_FINGERPRINT,
  };
}

/**
 * A stored draft back as a curvature, corrected for the set it was drafted in.
 *
 * Returns nothing when the numbers no longer mean what they say, or when nobody
 * has measured the set. The second is not a technicality: an unmeasured set's
 * offset is unknown and, across the eighteen that are measured, routinely larger
 * than the thing being read -- see `DIAL_BASELINES`. Including such a draft
 * would put a fact about the format into a sentence about the person, and the
 * caller cannot tell afterwards that it happened. So the caller is told to its
 * face, and counts them.
 */
export function curvatureOf(
  stored: StoredDials,
  setCode: string,
): DialCurvature | undefined {
  if (stored.fingerprint !== DIAL_FINGERPRINT) return undefined;
  const baseline = setBaseline(setCode);
  if (!baseline) return undefined;

  return rebaseCurvature(
    {
      gradient: stored.gradient,
      hessian: stored.hessian,
      logLik: stored.logLik,
      picks: stored.picks,
    },
    baseline,
  );
}
