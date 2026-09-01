import { FITTED_POLICIES, POLICY_FEATURES, type PolicyWeights } from "./policy.js";
import type { StoredPod } from "./bots.js";

// What ONE drafter does differently from the table, in as few numbers as the
// data can carry.
//
// WHY NOT JUST REFIT `POLICY_FEATURES` PER PLAYER
//
// Because it would be noise wearing a coefficient's clothes. `fit-bot-policy`
// fits ten weights over 571,996 picks; a person arrives with ~42 a draft. And
// the ten columns are collinear by construction -- `value` is -1.5932 while
// `valueOpen` is 17.1665, and neither number means anything without the other,
// because they are the same quantity asked twice at different pack sizes. Fit
// that pair free on forty-two decisions and the two weights trade places
// between drafts while their sum barely moves. Every reading off them would be
// real-looking and wrong, which is the failure mode `policy.ts` spends its
// length avoiding one layer down.
//
// SO THE RATIOS INSIDE A BUNDLE ARE FROZEN AND ONLY ITS OVERALL WEIGHT MOVES
//
// A bundle is a group of columns that say ONE thing about a drafter. `laneFit`
// and `laneFitLate` are both "how much does committing to a colour matter",
// differing only in when; the fit over half a million picks already settled how
// those two trade off, and a person's forty-two picks have nothing to add to
// that. What a person's picks CAN say is whether the pair, as a pair, matters
// more or less to them than it does to the field.
//
// So the model is the shipped policy with one multiplier per bundle:
//
//   u(card) = SUM over bundles b of  theta_b * (w_b . f)
//
// where `w` is a shipped pod's weights and `f` is `policyFeatures`. At
// theta = 1 this IS that pod, exactly -- see `dialledScore`'s test. That
// identity is the whole reason this file imports the weights rather than
// restating them: a drafter is measured as a deviation from a policy the app
// actually deals with, not from a paraphrase of one.
//
// It is also just a conditional logit again, on `bundles.length` columns instead
// of ten, so the arithmetic downstream is the same arithmetic `fit-bot-policy`
// already runs -- with the null at one rather than at zero.
//
// WHAT A BUNDLE IS NOT
//
// It is not a claim that a drafter thinks in these six categories. It is a claim
// about what forty-two picks can separate, which is a much weaker and much more
// checkable thing -- and `bundleSpread` below is how it gets checked rather than
// asserted.
//
// THE NAMES HERE ARE CODE NAMES. Nothing in this file is cleared to appear on a
// screen: "dial" is not a word this game uses, and what a player is shown has to
// come out of `docs/vernacular.yaml` instead.

/**
 * The bundles, and the columns each one owns.
 *
 * A PARTITION, ENFORCED BELOW, WHICH IS THE POINT OF THE THROW AT THE BOTTOM.
 *
 * Every column of `POLICY_FEATURES` belongs to exactly one bundle. If a feature
 * were left out, `dialledScore` at theta = 1 would quietly stop equalling the
 * pod it is built from -- the drafter would be measured against a policy that
 * ignores a column the bots read -- and nothing downstream could tell. A new
 * feature in `policy.ts` therefore has to be placed here, and until it is, this
 * module refuses to load.
 */
export const DIAL_BUNDLES = [
  {
    id: "power",
    // What wins. Both columns are `cardValue` centred, differing only in how
    // full the pack is -- see `valueOpen` in policy.ts for why that interaction
    // exists and why a per-pack z-score is not it.
    features: ["value", "valueOpen"],
  },
  {
    id: "table",
    // What a real table pays, which is a different question from what wins and
    // is the reason `tableValue.ts` exists at all.
    features: ["tableValue", "tableValueOpen"],
  },
  {
    id: "lane",
    // Committing to a colour, and the ramp that says it matters more as the
    // draft goes on. The `--shape lane` probe settled the ramp; a person's
    // picks are not being asked to re-litigate it.
    features: ["laneFit", "laneFitLate"],
  },
  {
    id: "signal",
    // Reading what has flowed. One column, because `openness` earns nothing as
    // a main effect and lives entirely in its interaction with progress.
    features: ["opennessLate"],
  },
  {
    id: "rare",
    features: ["rare", "rareOpen"],
  },
  {
    id: "removal",
    features: ["removal"],
  },
] as const;

export type DialId = (typeof DIAL_BUNDLES)[number]["id"];

export const DIAL_IDS: readonly DialId[] = DIAL_BUNDLES.map((b) => b.id);

/** Which columns of a `policyFeatures` row each bundle reads. */
export const BUNDLE_COLUMNS: readonly (readonly number[])[] = DIAL_BUNDLES.map((bundle) =>
  bundle.features.map((name) => {
    const at = POLICY_FEATURES.indexOf(name);
    if (at === -1) throw new Error(`dial bundle "${bundle.id}" names no such feature: ${name}`);
    return at;
  }),
);

{
  const owned = new Map<number, string>();
  for (let b = 0; b < DIAL_BUNDLES.length; b++) {
    for (const column of BUNDLE_COLUMNS[b]) {
      const already = owned.get(column);
      if (already !== undefined) {
        throw new Error(
          `${POLICY_FEATURES[column]} is in two dial bundles, "${already}" and ` +
            `"${DIAL_BUNDLES[b].id}". A column in two bundles is counted twice at theta = 1, ` +
            `so the model would not be the policy it claims to be a deviation from.`,
        );
      }
      owned.set(column, DIAL_BUNDLES[b].id);
    }
  }
  const missing = POLICY_FEATURES.filter((_, k) => !owned.has(k));
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} belong${missing.length === 1 ? "s" : ""} to no dial bundle. ` +
        `Every policy feature must be placed in exactly one, or a drafter is fitted against ` +
        `a policy that ignores a column the bots read -- silently. Add it to DIAL_BUNDLES.`,
    );
  }
}

/**
 * The bundle scores for one candidate: `w_b . f`, one number per bundle.
 *
 * Written into a caller-supplied array for the same reason `policyFeatures` is:
 * a draft is ~600 candidates and a recovery run is tens of thousands of drafts.
 */
export function bundleScores(
  features: readonly number[],
  weights: PolicyWeights,
  out: number[] = new Array(DIAL_BUNDLES.length),
): number[] {
  for (let b = 0; b < BUNDLE_COLUMNS.length; b++) {
    let s = 0;
    for (const k of BUNDLE_COLUMNS[b]) s += (weights[k] ?? 0) * features[k];
    out[b] = s;
  }
  return out;
}

/**
 * The dialled utility of one candidate. At `theta` all ones this is exactly the
 * pod's own `policyScore`, which is the identity the whole file rests on.
 */
export function dialledScore(bundles: readonly number[], theta: readonly number[]): number {
  let u = 0;
  for (let b = 0; b < bundles.length; b++) u += theta[b] * bundles[b];
  return u;
}

/** A drafter who picks exactly like the pod they are being compared against. */
export const NEUTRAL_DIALS: readonly number[] = DIAL_BUNDLES.map(() => 1);

/**
 * Which bundles a pod's weights can express an opinion with at all.
 *
 * A DIAL ON A BUNDLE THAT DOES NOT MOVE A PACK IS NOT A WEAK MEASUREMENT, IT IS
 * NO MEASUREMENT.
 *
 * `table3` prices `removal` at 0.0515. Multiply that by two and every card in
 * the pack moves by about a twentieth of nothing, so the likelihood is flat
 * along that dial and its fitted value is whatever the noise says. That reads
 * identically to "this player is average on removal", which is the confusion
 * worth refusing outright.
 *
 * A conditional logit only ever sees DIFFERENCES within a pack -- adding a
 * constant to every candidate changes no probability -- so the quantity that
 * decides whether a bundle can be dialled is its spread across the cards on
 * offer, not its level. This returns exactly that: the mean, over packs, of the
 * standard deviation of each bundle score WITHIN a pack, in logit units.
 *
 * Which is directly comparable across bundles, because every one of them is
 * already multiplied by its own fitted weight -- these are contributions to one
 * score, not features in six different units.
 */
export function bundleSpread(packs: readonly (readonly number[])[][]): number[] {
  // Sized from the rows rather than from DIAL_BUNDLES, so a caller handing this
  // something the wrong width gets a short answer instead of one padded with
  // zeros -- and a zero here reads as "this bundle cannot be dialled", which is
  // the one conclusion that must never arrive by accident.
  const width = packs.find((p) => p.length > 0)?.[0].length ?? 0;
  const totals = new Array(width).fill(0);
  let counted = 0;

  for (const pack of packs) {
    if (pack.length < 2) continue;
    counted++;
    for (let b = 0; b < width; b++) {
      let sum = 0;
      let sumSq = 0;
      for (const card of pack) {
        sum += card[b];
        sumSq += card[b] * card[b];
      }
      const mean = sum / pack.length;
      totals[b] += Math.sqrt(Math.max(0, sumSq / pack.length - mean * mean));
    }
  }

  return counted === 0 ? totals : totals.map((t) => t / counted);
}

/**
 * The pod a drafter is measured against, and why it is not a free choice.
 *
 * A player's picks are made out of packs a pod passed them, so the comparison
 * that means anything is against the pod that dealt the draft. Comparing a
 * `table3` draft to `sharks3` would price the drafter and the table difference
 * together and report the sum as the person.
 */
export function baselineFor(pod: StoredPod): PolicyWeights {
  return FITTED_POLICIES[pod];
}
