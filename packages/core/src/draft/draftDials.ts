import { FITTED_POLICIES } from "./policy.js";
import {
  DIAL_FINGERPRINT,
  DIAL_YARDSTICK,
  dialPicksFrom,
  setBaseline,
  type DraftRow,
} from "./dials.js";
import {
  dialCurvature,
  drafterFromCurvature,
  rebaseCurvature,
  type DialCurvature,
} from "./dialFit.js";
import { DIAL_BUNDLES, type DialId } from "./dials.js";

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


/**
 * Which dials a person is shown, and why it is two of six.
 *
 * THIS LIST IS THE OUTPUT OF THREE PHASES OF MEASUREMENT, NOT A LAYOUT CHOICE.
 * Every name left out was left out for a reason with a number behind it.
 *
 * `rare` and `removal` move a real fdn pack by 0.029 and 0.011 logits against
 * `table`'s 4.101, and a simulated drafter dealt at 1.5x or 0.5x on either is
 * never once called different at any draft count. A dial nothing can move reads
 * on screen exactly like "you are average at this", and those two would say it
 * forever.
 *
 * `power` cannot be told from `table`: both are raw power, `table` carries five
 * times the spread and absorbs the variation, and a drafter dealt at 1.5x on
 * `power` is called 13% of the time after twenty-five drafts. It is also where
 * the 3-0 drafters differ from the field, which is why the most interesting
 * thing this readout could have said is not among the things it says.
 *
 * `table` is dropped for the opposite reason -- it is measurable and it is not
 * SEPARABLE. At fifteen drafts a `lane` x1.5 drafter lights up `lane` at 100%
 * and `table` at 92%; a `table` x1.5 drafter lights up `table` at 90% and `lane`
 * at 95%, and the confusion sharpens with more data rather than washing out,
 * which is what says it is real rather than noisy. Two rows there would be one
 * finding printed twice, and a reader would take the second as corroboration of
 * the first.
 *
 * Of the pair, `lane` is the one kept, and that is a judgement rather than a
 * measurement. It is the one a Limited player already has words for and can do
 * something about -- committing early or staying open is a decision somebody
 * makes on purpose. "You take the cards the field takes" is harder to say and
 * close to a restatement of the grade the app already gives on every pick.
 */
export const SHOWN_DIALS = ["lane", "signal"] as const satisfies readonly DialId[];

/**
 * The dials a surface actually has to write words for.
 *
 * A tuple rather than `DialId[]`, so a screen's copy can be keyed on exactly
 * this and adding a name above is a compile error everywhere that has to say
 * something about it. The alternative is a screen that renders a new dial with
 * no sentence, or with an empty one, which is how a measurement reaches a person
 * as blank space.
 */
export type ShownDialId = (typeof SHOWN_DIALS)[number];

/** One dial as a reader gets it: where they sit, and how sure that is. */
export interface ShownDial {
  id: ShownDialId;
  /** Relative to the drafter's own sharpness, so 1 is "like the field". */
  value: number;
  se: number;
  /** Whether the interval clears 1 -- the only thing that licences a sentence. */
  called: boolean;
}

export interface DrafterReadout {
  dials: ShownDial[];
  /**
   * How consistently they pick. A DIRECTION and not a value: the one-step
   * estimate off stored curvature is biased -- 0.24 against a truth of 0.50 on a
   * drafter who is half as decisive -- so `above` is trustworthy and the number
   * beside it is not, and nothing should print it as a figure.
   */
  sharpness: { above: boolean; called: boolean };
  picks: number;
}

/** A pooled curvature as the two sentences it can support, and no more. */
export function drafterReadout(curvature: DialCurvature, tau: number): DrafterReadout {
  const fit = drafterFromCurvature(curvature, tau);
  const clears = (value: number, se: number) => Math.abs(value - 1) > 1.96 * se;

  return {
    dials: SHOWN_DIALS.map((id) => {
      const at = DIAL_BUNDLES.findIndex((b) => b.id === id);
      return {
        id,
        value: fit.relative[at],
        se: fit.relativeSe[at],
        called: clears(fit.relative[at], fit.relativeSe[at]),
      };
    }),
    sharpness: {
      above: fit.sharpness > 1,
      called: clears(fit.sharpness, fit.sharpnessSe),
    },
    picks: fit.picks,
  };
}
